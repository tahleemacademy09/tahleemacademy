# modal_app.py
#
# Deploys obadx/muaalem-model-v3_2 (the "Quran Muaalem" model) as a FastAPI
# service on Modal, matching the request/response contract your existing
# `tajweed-check` Supabase edge function already expects:
#
#   POST /analyze
#     multipart/form-data: file=<audio blob>, expected_text=<ayah text>
#     -- or --
#     JSON: { audio: <base64>, mimeType: "...", expected_text: "..." }
#
#   Response: JSON error breakdown (phoneme diff, sifat/harakah errors, etc.)
#
# ─────────────────────────────────────────────────────────────────────────
# HONEST STATUS NOTE (read this before deploying):
#
# The model-loading and phonetic-comparison logic below is a best-effort
# first draft. I could not pull the exact source of obadx/quran-muaalem's
# inference code (no API access to fetch that specific file), so two pieces
# are written defensively rather than confirmed:
#
#   1. Loading `Wav2Vec2BertForMultilevelCTC` — HuggingFace's own model
#      card snippet shows it imported directly from `transformers`, but
#      custom architectures like this usually need `trust_remote_code=True`.
#      I've coded both paths with a fallback.
#
#   2. Phonetizing the *expected* ayah text (turning "بِسْمِ اللَّهِ" into
#      the model's phoneme/harakah script) — this depends on the
#      `quran-transcript` package's exact function names, which I'm
#      inferring from the project name, not confirmed source.
#
# When you run `modal deploy modal_app.py`, if step 1 or 2 is wrong, Modal's
# deploy/runtime logs will show an ImportError or AttributeError naming the
# real function — send me that error and I'll fix the exact call. This is
# normal for a first pass against a research model with no formal API docs.
# ─────────────────────────────────────────────────────────────────────────

import base64
import io
import json

import modal

app = modal.App("tahleem-muaalem-tajweed")

MODEL_ID = "obadx/muaalem-model-v3_2"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "fastapi[standard]",
        "python-multipart",
        "torch",
        "torchaudio",
        "transformers>=4.44",
        "accelerate",
        "librosa",
        "soundfile",
        "numpy",
        "huggingface_hub",
        # Best-guess package name for obadx's phonetic-script tooling.
        # If `modal deploy` fails on this line, drop it and we'll vendor
        # the phonetizer directly instead.
        "quran-transcript",
    )
)

with image.imports():
    import numpy as np
    import librosa
    import torch


def _load_model():
    """Load the Muaalem model + processor, trying the plain path first
    and falling back to trust_remote_code=True (see note at top of file)."""
    from transformers import AutoProcessor

    processor = AutoProcessor.from_pretrained(MODEL_ID)

    try:
        from transformers import Wav2Vec2BertForMultilevelCTC
        model = Wav2Vec2BertForMultilevelCTC.from_pretrained(
            MODEL_ID, device_map="auto"
        )
    except (ImportError, ValueError):
        from transformers import AutoModel
        model = AutoModel.from_pretrained(
            MODEL_ID, trust_remote_code=True, device_map="auto"
        )

    model.eval()
    return processor, model


def _phonetize_expected_text(expected_text: str):
    """Turn the Uthmani ayah text into the model's phoneme/harakah script
    for comparison. Package/function names are a best guess — fix once
    `modal deploy` surfaces the real API."""
    try:
        from quran_transcript import phonetize  # best-guess import path
        return phonetize(expected_text)
    except Exception as e:
        # Fail loudly with a clear marker rather than silently returning
        # garbage — you'll see this in the response if the guess was wrong.
        return {"_phonetize_error": str(e), "raw_text": expected_text}


def _diff_phonemes(predicted: str, expected):
    """Very simple placeholder alignment: word-level diff between the
    model's predicted phoneme string and the expected phoneme string.
    This is intentionally simple for v1 — real harakah-level diffing
    (madd length, ghunnah, sifat) should use whatever comparison utility
    ships with quran-transcript once we confirm its API."""
    import difflib

    expected_str = expected if isinstance(expected, str) else json.dumps(expected)
    pred_words = predicted.split()
    exp_words = expected_str.split()

    sm = difflib.SequenceMatcher(a=exp_words, b=pred_words)
    errors = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != "equal":
            errors.append({
                "type": tag,  # replace / delete / insert
                "expected_words": exp_words[i1:i2],
                "recited_words": pred_words[j1:j2],
                "position": i1,
            })

    total = max(len(exp_words), 1)
    correct = sum(1 for tag, *_ in sm.get_opcodes() if tag == "equal")
    score = round(100 * correct / total, 1)

    return {"score_percent": score, "errors": errors}


@app.cls(gpu="T4", image=image, scaledown_window=120, timeout=900)
class Muaalem:
    @modal.enter()
    def load(self):
        self.processor, self.model = _load_model()

    @modal.method()
    def analyze(self, audio_bytes: bytes, expected_text: str):
        # Decode audio -> 16kHz mono float32, what wav2vec2-bert expects
        audio_arr, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)

        inputs = self.processor(
            audio_arr, sampling_rate=16000, return_tensors="pt"
        )
        with torch.no_grad():
            outputs = self.model(**inputs)

        # CTC greedy decode -> predicted phoneme/text string
        logits = outputs.logits if hasattr(outputs, "logits") else outputs[0]
        pred_ids = torch.argmax(logits, dim=-1)
        predicted_text = self.processor.batch_decode(pred_ids)[0]

        expected_phonetic = _phonetize_expected_text(expected_text)
        diff = _diff_phonemes(predicted_text, expected_phonetic)

        return {
            "predicted_phonemes": predicted_text,
            "expected_phonetic": expected_phonetic,
            "diff": diff,
        }


web_app_image = image


@app.function(image=web_app_image, timeout=900)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    web = FastAPI()
    muaalem = Muaalem()

    @web.get("/health")
    async def health():
        return {"status": "ok"}

    @web.post("/analyze")
    async def analyze(request: Request):
        content_type = request.headers.get("content-type", "")

        if "multipart/form-data" in content_type:
            form = await request.form()
            file = form.get("file")
            if file is None:
                return JSONResponse({"error": "no audio file received"}, status_code=400)
            audio_bytes = await file.read()
            expected_text = str(form.get("expected_text") or "")
        else:
            body = await request.json()
            audio_b64 = body.get("audio")
            if not audio_b64:
                return JSONResponse({"error": "missing audio"}, status_code=400)
            audio_bytes = base64.b64decode(audio_b64)
            expected_text = body.get("expected_text") or ""

        if not expected_text:
            return JSONResponse(
                {"error": "missing expected_text (the ayah being recited)"},
                status_code=400,
            )

        try:
            result = muaalem.analyze.remote(audio_bytes, expected_text)
            return JSONResponse(result)
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)

    return web
