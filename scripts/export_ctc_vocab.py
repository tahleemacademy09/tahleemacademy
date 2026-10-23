#!/usr/bin/env python3
"""
export_ctc_vocab.py - run ONCE, from the folder that holds ctc_model/ (the one ctc_align_test.py made).

  python export_ctc_vocab.py                       # reads ./ctc_model, writes ./public/ctc
  python export_ctc_vocab.py ctc_model public/ctc  # explicit

Writes two small files the browser needs (the 132 MB model itself is downloaded by the browser):
  vocab.json     - SentencePiece pieces + scores, so the app can tokenise reference words exactly like Python
  sp_tests.json  - (word -> token ids) made by the REAL sentencepiece, used by the in-app self-test
Commit both files. pip install sentencepiece   (already installed if ctc_align_test.py ran)
"""
import json, os, random, re, sys
import sentencepiece as spm

d = sys.argv[1] if len(sys.argv) > 1 else "ctc_model"
out = sys.argv[2] if len(sys.argv) > 2 else "public/ctc"
os.makedirs(out, exist_ok=True)

sp = spm.SentencePieceProcessor(model_file=os.path.join(d, "tokenizer.model"))
n = sp.get_piece_size()
pieces = [sp.id_to_piece(i) for i in range(n)]
scores = [round(sp.get_score(i), 6) for i in range(n)]
types = [2 if sp.is_unknown(i) else 3 if sp.is_control(i) else 5 if sp.is_unused(i) else 6 if sp.is_byte(i) else 1
         for i in range(n)]

# Which order does the vocabulary write shadda + vowel in?  (the order the model was trained on)
VOW = "\u064B\u064C\u064D\u064E\u064F\u0650"
sh_first = sum(1 for p in pieces if re.search("\u0651[" + VOW + "]", p))
vow_first = sum(1 for p in pieces if re.search("[" + VOW + "]\u0651", p))
has_diac = any(re.search("[\u064B-\u0652]", p) for p in pieces)
print(f"pieces {n}, unk id {sp.unk_id()}, shadda-first pieces {sh_first}, vowel-first pieces {vow_first}, diacritics {has_diac}")

with open(os.path.join(out, "vocab.json"), "w", encoding="utf-8") as f:
    json.dump({"pieces": pieces, "scores": scores, "types": types, "unkId": sp.unk_id(), "blank": n,
               "shaddaFirst": sh_first >= vow_first, "hasDiacritics": has_diac}, f, ensure_ascii=False, separators=(",", ":"))

# test vectors: single pieces and random pairs/triples of pieces (this is what real words look like to the tokenizer)
rng = random.Random(1)
normal = [p.lstrip("\u2581") for i, p in enumerate(pieces) if types[i] == 1 and len(p.lstrip("\u2581")) >= 1]
words = list(dict.fromkeys(normal))
for _ in range(500):
    words.append("".join(rng.choice(normal) for _ in range(rng.choice([2, 3]))))
tests = [[w, sp.encode(w, out_type=int)] for w in words if w]
with open(os.path.join(out, "sp_tests.json"), "w", encoding="utf-8") as f:
    json.dump(tests, f, ensure_ascii=False, separators=(",", ":"))
print(f"wrote {out}/vocab.json and {out}/sp_tests.json ({len(tests)} test words)")
