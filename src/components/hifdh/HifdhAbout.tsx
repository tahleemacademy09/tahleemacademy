// src/components/hifdh/HifdhAbout.tsx
// "About the Hifdh Program — how everything works", written in an Islamic tone.
//   audience="student" → shown full-screen from the student Overview (HifdhProgramHome)
//   audience="teacher" → shown as a collapsible card on the ustadh page (TeacherHifdhProgram)
// Values that the admin controls (days, streak limit, fine, amount per session) are passed in
// so the text always matches the real settings.

import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

const AB_DARK = "#0f2e1f";
const AB_GREEN = "#064E3B";
const AB_GOLD = "#C9A84C";
const AB_INK = "#1a1a2e";
const AB_MUTED = "#6b7a72";
const AB_LINE = "#e3e9e5";
const AB_CREAM = "#fbf3da";

const AB_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const abDays = (days: number[] | undefined | null, fallback: string) => {
  const d = (days || []).slice().sort((a, b) => a - b).map((n) => AB_DAY[n - 1]).filter(Boolean);
  if (!d.length) return fallback;
  if (d.length === 1) return d[0];
  return `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
};

export interface HifdhAboutProps {
  audience: "student" | "teacher";
  /** 1 = Monday … 7 = Sunday */
  memDays?: number[] | null;
  reviewDays?: number[] | null;
  streakLimit?: number | null;
  fine?: number | string | null;
  /** e.g. "½ page" */
  amountLabel?: string;
}

/* ───────── small building blocks ───────── */
const AbSection = ({ title, ar, children }: { title: string; ar?: string; children: React.ReactNode }) => (
  <section style={{ background: "#fff", border: `1px solid ${AB_LINE}`, borderRadius: 16, padding: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: AB_GREEN }}>{title}</h3>
      {ar && <span style={{ fontFamily: "'Amiri',serif", fontSize: 17, color: AB_GOLD }}>{ar}</span>}
    </div>
    {children}
  </section>
);

const AbStep = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: n === 1 ? "none" : `1px solid ${AB_LINE}` }}>
    <div style={{
      width: 30, height: 30, flexShrink: 0, borderRadius: "50%", background: AB_GREEN, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800,
    }}>{n}</div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontWeight: 800, fontSize: 14.5, color: AB_INK, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "#3d4a43" }}>{children}</div>
    </div>
  </div>
);

const AbQuote = ({ ar, en, src }: { ar: string; en: string; src: string }) => (
  <div style={{ background: AB_CREAM, border: `1px solid ${AB_GOLD}88`, borderRadius: 14, padding: "12px 14px", textAlign: "center" }}>
    <div dir="rtl" style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 21, lineHeight: 1.9, color: AB_INK }}>{ar}</div>
    <div style={{ fontSize: 13, fontStyle: "italic", color: "#5b4a1a", marginTop: 4, lineHeight: 1.5 }}>{en}</div>
    <div style={{ fontSize: 11, fontWeight: 700, color: AB_MUTED, marginTop: 4 }}>{src}</div>
  </div>
);

const AbList = ({ items }: { items: React.ReactNode[] }) => (
  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 7, fontSize: 13.5, lineHeight: 1.6, color: "#3d4a43" }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);

const AbP = ({ children, mt }: { children: React.ReactNode; mt?: number }) => (
  <p style={{ margin: 0, marginTop: mt ?? 0, fontSize: 13.5, lineHeight: 1.7, color: "#3d4a43" }}>{children}</p>
);

const AbBanner = ({ title, ar, text }: { title: string; ar: string; text: string }) => (
  <div style={{ background: `linear-gradient(160deg,${AB_DARK},#14402c)`, borderRadius: 16, padding: "18px 16px", color: "#fff", textAlign: "center" }}>
    <div style={{ fontFamily: "'Amiri',serif", fontSize: 24, color: AB_GOLD, marginBottom: 6 }} dir="rtl">{ar}</div>
    <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.88 }}>{text}</div>
  </div>
);

const AbDua = ({ ar, en }: { ar: string; en: string }) => (
  <div style={{ textAlign: "center", padding: "6px 4px 2px" }}>
    <div dir="rtl" style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 20, color: AB_GREEN, lineHeight: 1.9 }}>{ar}</div>
    <div style={{ fontSize: 12.5, color: AB_MUTED, fontStyle: "italic" }}>{en}</div>
  </div>
);

/* ───────── content ───────── */
export function HifdhAboutContent({ audience, memDays, reviewDays, streakLimit, fine, amountLabel }: HifdhAboutProps) {
  const memText = abDays(memDays, "the days your admin sets");
  const revText = abDays(reviewDays && reviewDays.length ? reviewDays : [5, 6, 7], "Friday to Sunday");
  const limit = streakLimit ?? 3;
  const fineText = fine != null && Number(fine) > 0 ? `₦${Number(fine).toLocaleString()}` : "a small fine";

  if (audience === "teacher") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <AbBanner
          ar="بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ"
          title="Your trust as an Ustadh"
          text="Bismillah. You carry the Qur'an to the next generation — one page at a time. This guide explains how the Hifdh Program flows, so every student is treated with the same care and fairness, in shā' Allāh."
        />
        <AbQuote
          ar="خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ"
          en="“The best among you are those who learn the Qur'an and teach it.”"
          src="Ṣaḥīḥ al-Bukhārī"
        />

        <AbSection title="The weekly flow" ar="سير الأسبوع">
          <AbStep n={1} title="Read-Along — hear them read first">
            Choose <b>Session 1</b> or <b>Session 2</b>, then schedule the group's live class (memorization days: {memText}) and tap <b>Open class</b>.
            Each student is shown a suggested portion — {amountLabel ? <>their level asks for <b>{amountLabel}</b> per session, </> : "sized by their level, "}starting
            right after where they stopped. You may change the start page or the amount if needed.
          </AbStep>
          <AbStep n={2} title="Tap “Read correctly” or “Repeat”">
            When a student recites the portion correctly, tap <b>Read correctly</b> — this unlocks memorization for them (they will see “Memorize this”).
            If the reading is not yet sound, tap <b>Repeat</b> and they stay on “Getting ready”. Correct reading comes before memorizing.
            Once a portion is submitted or passed it is locked, so nothing changes by accident (only an admin can override).
          </AbStep>
          <AbStep n={3} title="Memorized tab — confirm what they memorized">
            Students memorize on their own, then press submit. Their name moves to the top of the <b>Memorized</b> tab. Listen to them, then tap
            <b> Memorized</b> — <i>only then</i> do they advance to the next page — or <b>Repeat</b> to keep them on the same page.
            Session 2 can only be marked memorized after Session 1, so the student never skips ahead.
          </AbStep>
          <AbStep n={4} title="Weekly Review — your private room">
            On the review days ({revText}) tap <b>Open my review room</b>. Only the students assigned to you join it. Everyone is tested on
            what they have memorized in the current round of <b>5 pages</b>; the card shows each student's <b>review portion</b>, how many days they revised
            this week and their average score.
          </AbStep>
          <AbStep n={5} title="Grade once, with ihsān">
            Choose <b>Pass</b> (moves on to the next pages), <b>Repeat</b>, <b>Fail</b> (repeats the same portion and receives the fine at close-out) or
            <b> Excuse</b> (a valid reason — no penalty). You may add a short note; the student will read it. After {revText} the admin closes the week.
          </AbStep>
        </AbSection>

        <AbSection title="What the student sees" ar="ما يراه الطالب">
          <AbList items={[
            <><b>Getting ready</b> → waiting for you to clear their reading.</>,
            <><b>Memorize this</b> → you cleared the reading; they are memorizing.</>,
            <><b>Waiting for your ustadh</b> → they submitted; it is your turn to listen.</>,
            <><b>Memorized ✓</b> / <b>Repeat this page</b> → your decision from the Memorized tab.</>,
          ]} />
          <AbP mt={10}>
            A student who misses weeks in a row is warned; after <b>{limit}</b> missed weeks their program is put on hold until the admin reinstates them.
            Fines ({fineText}) are applied by the admin when the week is closed — so your grades must be entered before then.
          </AbP>
        </AbSection>

        <AbSection title="Adab of the teacher" ar="آداب المعلّم">
          <AbList items={[
            "Renew your intention — teach for the sake of Allah alone, not for praise.",
            "Be gentle. Repeating a page is not failure; it is how the Qur'an settles in the heart.",
            "Be fair: the same standard for every student, and excuse those who truly have an excuse.",
            "Listen with full attention and correct mistakes in tajweed kindly and privately.",
            "Make du'a for your students by name — their success is part of your reward.",
          ]} />
          <div style={{ marginTop: 10 }}>
            <AbDua ar="رَبِّ زِدْنِي عِلْمًا" en="“My Lord, increase me in knowledge.” (Ṭā Hā 20:114)" />
          </div>
        </AbSection>

        <div style={{ textAlign: "center", fontSize: 12.5, color: AB_MUTED, lineHeight: 1.7, padding: "2px 8px 6px" }}>
          May Allah accept your effort, make the Qur'an a witness for you, and grant you the reward of every letter your students recite. Āmīn.
        </div>
      </div>
    );
  }

  /* ───────── student ───────── */
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AbBanner
        ar="بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ"
        title="Welcome to your Hifdh journey"
        text="Bismillah. You are walking the path of the people of the Qur'an. Here, you memorize step by step with your ustadh, revise every day, and are reviewed every week — until the words of Allah are firm in your heart, in shā' Allāh. This page explains how everything works."
      />
      <AbQuote
        ar="وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ"
        en="“And We have certainly made the Qur'an easy for remembrance — so is there anyone who will remember?”"
        src="Sūrat al-Qamar 54:17"
      />

      <AbSection title="Your week, step by step" ar="رحلتك الأسبوعية">
        <AbStep n={1} title="Make your niyyah and join the Read-Along">
          On the memorization days ({memText}) a live class opens. Tap <b>Memorization → Join</b> (the button only works on those days).
          Your ustadh listens to you read your new portion. Reading it <i>correctly</i> comes first — then memorizing. When your ustadh confirms your
          reading, your status changes from <b>Getting ready</b> to <b>Memorize this</b>.
        </AbStep>
        <AbStep n={2} title="Memorize your portion">
          Each week you have <b>two sessions</b> (S1 and S2). Each has its own portion{amountLabel ? <> — at your level, about <b>{amountLabel}</b> per session</> : null}.
          Open <b>Memorization</b>: the Qur'an page is shown whole, and a gold note tells you which half is yours. Use <b>A− / A+</b> to make the text comfortable.
          Repeat it again and again, in small pieces, until it flows. When you are ready, press <b>“I've memorized this — submit”</b>.
        </AbStep>
        <AbStep n={3} title="Your ustadh listens and decides">
          After you submit, you will see <b>Waiting for your ustadh</b>. Then either:
          <AbList items={[
            <><b>Memorized ✓</b> — alḥamdulillāh! You move on to the next page.</>,
            <><b>Repeat this page</b> — you stay on the same page, revise it and submit again. This is never a shame; repetition is how the Qur'an stays.</>,
          ]} />
          <div style={{ marginTop: 6 }}>Finish Session 1 before Session 2 — you only move forward when your ustadh confirms the first one.</div>
        </AbStep>
        <AbStep n={4} title="Daily revision (muraja'ah) — every single day">
          Memorizing is only half the work; guarding it is the other half. Open <b>Daily revision</b>, recite aloud and the app listens to you.
          You need at least <b>75%</b> in the reading, then <b>75%</b> in the short questions that follow. Every day you finish adds to your <b>REVISION</b> count.
          <div style={{ marginTop: 8 }}>
            <AbQuote
              ar="تَعَاهَدُوا هَذَا الْقُرْآنَ"
              en="“Keep refreshing your memory of the Qur'an — for it escapes faster than a camel from its rope.”"
              src="Ṣaḥīḥ al-Bukhārī & Muslim (meaning)"
            />
          </div>
        </AbStep>
        <AbStep n={5} title="Weekly review — live with your ustadh">
          Each week you are assigned to an ustadh who has a private review room. It is open on <b>{revText}</b>: you may join on any of those days —
          the day shown to you is only a suggestion — but it closes at the end of the last day. You will be asked about everything you memorized in your
          current round of <b>5 pages</b>. It grows as you advance, and after 5 pages a new round begins. Your ustadh then marks you:
          <b> Pass</b> (you go on to the next pages), <b>Repeat</b>, <b>Fail</b> (repeat the same portion) or <b>Excused</b> (a valid reason, no penalty).
        </AbStep>
      </AbSection>

      <AbSection title="Reading your Overview" ar="فهم الشاشة">
        <AbList items={[
          <><b>PAGE</b> — the page of the Qur'an you are on now.</>,
          <><b>DONE</b> — how many of your 2 sessions this week are submitted or memorized.</>,
          <><b>MISSED</b> — weeks missed in a row. Keep it at zero!</>,
          <><b>REVISION</b> — days you completed your daily revision this week.</>,
          <>A red number on a card means something is waiting for you (a page to memorize, a revision to do, or the weekly review being open).</>,
        ]} />
      </AbSection>

      <AbSection title="Amānah and accountability" ar="الأمانة">
        <AbP>
          The Qur'an is an <i>amānah</i> (a trust), and a trust is kept with steadiness. These rules are not here to burden you — they are the rope that
          keeps the camel from running away.
        </AbP>
        <AbList items={[
          <>If you miss weeks in a row, a warning appears at the top of your Overview. After <b>{limit}</b> missed weeks in a row your Hifdh program is put <b>on hold</b> — contact the admin to be reinstated. Your other classes are not affected.</>,
          <>A missed week, or a failed weekly review, may bring a fine ({fineText}), recorded when the admin closes the week. Unpaid fines show on your Overview until they are settled.</>,
          <>Sick, travelling or facing a real difficulty? Tell your ustadh in time — an <b>Excused</b> week carries no penalty.</>,
        ]} />
      </AbSection>

      <AbSection title="Adab of the student of the Qur'an" ar="آداب حامل القرآن">
        <AbList items={[
          "Begin with a sincere intention — you are memorizing for the sake of Allah alone.",
          "Sit in a quiet place, ideally in wudū', facing the qiblah, and begin with “Bismillāh”.",
          "Memorize in small pieces, repeat often, and keep a fixed time every day — steady little by little beats rushing.",
          "Revise before you add anything new; do not leave your old pages to be forgotten.",
          "Respect your ustadh, listen to the correction, and do not be shy to repeat.",
          "Make du'a often, and avoid sins — the heart that is clean holds the Qur'an best.",
        ]} />
        <div style={{ marginTop: 10 }}>
          <AbDua ar="رَبِّ زِدْنِي عِلْمًا" en="“My Lord, increase me in knowledge.” (Ṭā Hā 20:114)" />
        </div>
      </AbSection>

      <AbQuote
        ar="الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ"
        en="“The one who is skilled in the Qur'an will be with the noble and obedient angels. And the one who recites with difficulty and struggles through it will have a double reward.”"
        src="Ṣaḥīḥ al-Bukhārī & Muslim"
      />
      <div style={{ textAlign: "center", fontSize: 12.5, color: AB_MUTED, lineHeight: 1.7, padding: "2px 8px 10px" }}>
        May Allah make the Qur'an the spring of your heart, the light of your chest and the remover of your worries. Āmīn.
      </div>
    </div>
  );
}

/** Collapsible card (used on the teacher page) */
export function HifdhAboutCard(props: HifdhAboutProps & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  const { defaultOpen: _d, ...rest } = props;
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer",
        background: "#fff", borderRadius: 16, padding: 12, border: `2px solid ${open ? AB_GOLD : AB_LINE}`,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: AB_GREEN + "14", color: AB_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BookOpen size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: AB_INK }}>About the program · How it works</div>
          <div style={{ fontSize: 12, color: AB_MUTED, marginTop: 2 }}>A guide for the ustadh — the weekly flow and your role</div>
        </div>
        {open ? <ChevronUp size={20} color={AB_MUTED} /> : <ChevronDown size={20} color={AB_MUTED} />}
      </button>
      {open && <div style={{ marginTop: 10 }}><HifdhAboutContent {...rest} /></div>}
    </div>
  );
}
