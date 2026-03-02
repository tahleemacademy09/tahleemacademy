

## Tahleem Platform — Master Correction Plan

This plan addresses 8 areas: bilingual display merge, editor save/reload, audio fixes, admin audio player upgrade, Arabic text readability, question nav wrapping, and data safety. No database schema changes. No data loss.

---

### PART 1 — Merge English + Arabic Display Logic

**Problem:** Student view uses `language === "ar" ? question_text_ar || question_text : question_text` — so if the user's UI is English, Arabic-only questions show blank. Both fields are never shown together.

**Fix in 3 files:**

- **`ExamTaking.tsx` (line ~602):** Replace single-language render with a helper that shows both fields when both exist, one below the other. If only one exists, show that one. If both empty, show "Question text missing" fallback.
- **`GradingPage.tsx` (line ~241-244):** Same bilingual merge logic.
- **`ExamResults.tsx` (line ~133-137):** Same bilingual merge logic.

The render pattern will be:
```tsx
{q.question_text && (
  <div dir="auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
)}
{q.question_text_ar && q.question_text_ar !== q.question_text && (
  <div dir="rtl" className="arabic-text-styles" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }} />
)}
{!q.question_text && !q.question_text_ar && (
  <p className="text-muted-foreground italic">Question text missing. Please contact administrator.</p>
)}
```

Similarly for MCQ option text: show both `opt.text` and `opt.text_ar` when both exist and differ.

---

### PART 2 — Fix Editor Save & Reload Consistency

**Problem:** The editor saves `question_text` and copies it to `question_text_ar` on save (line 222). On reload (line 170-183), it loads `question_text` back into the editor. This is already consistent.

**Actual issue:** The `RichTextEditor` uses `contentEditable` with a ref-based sync. When questions load from DB, the `useEffect` at line 36-41 checks `value !== internalValue.current`. If the value is set before the component mounts, it may not apply. 

**Fix:** In `RichTextEditor.tsx`, update the `useEffect` to also handle initial mount — set innerHTML on first render if `value` is non-empty. Add an `initializedRef` to ensure first load always applies.

---

### PART 3 — Audio Recording System Fix

**Current state:** Audio upload happens inline (ExamTaking line 720-732). The upload uses `upsert: true` and stores the signed URL in `answer_data.audioUrl`.

**Fixes:**
- Add file size validation (> 0 bytes) before upload.
- Add error toast when upload fails instead of silently falling back to blob URL.
- On submit, check if any audio questions have pending uploads (no signed URL yet) and warn.
- Add error display in MediaPreview when audio fails to load (`onError` handler).

---

### PART 4 — Admin Audio Player Controls

**Problem:** GradingPage's `MediaPreview` for audio is minimal — just play/pause with no seek, volume, speed, or skip controls.

**Fix:** Create a new `AdminAudioPlayer` component with:
- Play/Pause button
- Seek bar (slider showing current time / duration)
- Current time and duration display
- Volume control slider
- 10-second forward/backward skip buttons
- Playback speed selector (1x, 1.5x, 2x)
- Error state: "Audio file unavailable or corrupted"

Replace the audio section in both `GradingPage.tsx` MediaPreview and `ExamResults.tsx` MediaPreview with this component.

---

### PART 5 — Arabic Text Readability Fix

**Fix:** Add CSS classes for Arabic content rendering across all views:

In `index.css`, add:
```css
.arabic-exam-text {
  font-family: 'Amiri', 'Noto Naskh Arabic', 'Cairo', serif;
  font-size: 20px;
  line-height: 1.8;
  direction: rtl;
  text-align: right;
}
```

Apply this class to all Arabic `dangerouslySetInnerHTML` blocks in ExamTaking, GradingPage, and ExamResults. Also apply to Arabic option text rendering.

---

### PART 6 — Student Exam Navigation Fix

**Problem:** Mobile bottom bar (ExamTaking line 818-839) uses `overflow-x-auto` with `shrink-0` on buttons, causing horizontal scroll.

**Fix:** Replace with `flex-wrap` layout:
```tsx
<div className="flex flex-wrap items-center gap-1.5 pb-1">
  {questions.map((qq, i) => (
    <button
      key={qq.id}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ...`}
    >
      {i + 1}
    </button>
  ))}
</div>
```
Remove `shrink-0` and `overflow-x-auto`. The container auto-wraps into rows. Apply same treatment to desktop left panel grid (already uses `grid-cols-4` which wraps, so that's fine).

---

### PART 7 — Data Safety

No database migrations needed. No columns dropped. No data overwritten. All changes are purely frontend rendering and component logic. The `question_text_ar` column is read but never deleted or truncated.

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/exam/AdminAudioPlayer.tsx` | **Create** — Full-featured audio player for admin |
| `src/pages/student/ExamTaking.tsx` | Edit — Bilingual merge, nav wrapping, Arabic styles |
| `src/pages/admin/GradingPage.tsx` | Edit — Bilingual merge, replace MediaPreview audio with AdminAudioPlayer |
| `src/pages/student/ExamResults.tsx` | Edit — Bilingual merge, replace MediaPreview audio, Arabic styles |
| `src/components/exam/RichTextEditor.tsx` | Edit — Fix initial load reliability |
| `src/index.css` | Edit — Add Arabic text styling class |

