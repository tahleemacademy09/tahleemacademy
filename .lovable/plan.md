# Tahleem — Notifications, Live Class Background Audio & Hifdh Crash

## 1. Fix Hifdh dashboard crash (BLOCKER — do first)
The error `ReferenceError: Cannot access 'le' before initialization` is a minified Temporal Dead Zone bug — a `const`/`let` is referenced before it's defined, almost always caused by a circular import between Hifdh components. I will:
- Trace the import graph starting from `HifdhPage → HifdhRevision → HifdhDashboard → surahData/hifdhTokens/audioManager`.
- Break the cycle (usually by moving shared constants into `hifdhTokens.ts` or a new `hifdhShared.ts`) and convert offending top-level `const` usages that depend on cycle-loaded modules.
- Verify by loading `/student/hifdh` in a headless browser and confirming no console error.

## 2. Live class notifications — single fire + deep link
Current pain: multiple duplicate pushes per class; tapping the push doesn't go straight to the live class.

Rework:
- **Server-side scheduling** (`schedule-class-reminders` + `send-class-reminder` edge functions) becomes the single source of truth. Add an idempotency table `class_notification_log(class_id, kind, sent_at)` with a UNIQUE constraint on `(class_id, kind)` so any retry is a no-op.
  - `kind = "reminder_15m"` fires exactly once, ~15 min before start.
  - `kind = "starting_now"` fires exactly once at start time.
- Remove/disable duplicate client-side triggers in `useTimetableNotifications` and `useClassRing` that also push; they'll only handle the in-app ring/UI, not the OS push.
- Push payload gains `url: "/student/subject/{subjectId}?join=1"` and `data.action = "join-live-class"`.
- `sw.js notificationclick` uses `clients.openWindow(url)` / focuses existing client and posts `{type:"NAV", url}`.
- `useNotificationNavigator` reads `?join=1` and calls `joinClass(subject, {autoJoin:true})` so the classroom opens directly.

## 3. Wire all admin/teacher actions to notifications
One shared helper `notify(recipients, {title, body, url, kind})` used by:
- New announcement (admin & teacher) → students in target level/subject.
- New material upload → enrolled students in that subject.
- New recording available → enrolled students.
- Daily Hifdh revision reminder (already exists in `hifdh-reminder`) — verify cron is enabled, dedupe per user per day.
- New assignment / grade published → student.

All go through the same `dispatch-notification` edge function so web-push + in-app inbox + deep link stay consistent.

## 4. Cross-role flow bug sweep
Quick audit only (not a rewrite):
- Admin creates class → does it appear for assigned teacher + enrolled students? Timezone bug check.
- Teacher uploads material/recording → student sees it + gets one push.
- Student joins class → teacher sees participant; leave/rejoin doesn't dupe attendance rows.
Report findings; fix small bugs inline, flag anything larger.

## 5. Background audio in PWA (WhatsApp-like)
Root cause: on Android PWA the WebRTC mic track is muted when the tab is hidden / screen off unless the page owns a MediaSession + a silent looping audio element to keep the audio pipeline "playing".

Fix plan (`useBackgroundAudio` + `GlobalClassroomOverlay`):
- Ensure `navigator.mediaSession.setActionHandler("play"/"pause"/"hangup")` is set when a call starts, with a real `metadata` (subject title + academy logo).
- Attach a hidden `<audio loop playsinline>` with a 1-sec silent ogg/mp3 that `play()`s on join — keeps the audio focus alive so Android doesn't suspend the LiveKit publisher.
- On the LiveKit room, disable "stop track on hidden" and re-enable the mic track in `visibilitychange` if it was auto-muted.
- Keep the existing `useForegroundService` path for the wrapped Android app; add a Wake Lock (`navigator.wakeLock.request("screen")` optional, and audio-focus via MediaSession is the key for PWA).
- Verify in the SW that `LIVE_CLASS_KEEPALIVE` doesn't tear down the audio context.

## Order of work
1. Ship crash fix + verify (small, isolated).
2. Background-audio PWA fix (highest user-visible impact).
3. Notification dedupe + deep link + admin/teacher hooks (bigger, one PR).
4. Flow audit report.

## Questions before I start
1. For "one push 15 min before + one at start" — do you also want a **1-hour-before** reminder or just those two?
2. Should teachers also receive the "class starting" push, or only students?
3. For material/announcement notifications, do you want them **immediate** on upload, or **batched** (e.g. one summary per hour) to avoid noise?
4. The PWA background-audio fix needs a tiny silent audio file (~2 KB). OK to add `public/silence.mp3`?
