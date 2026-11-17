/*  src/components/classroom/lessonBuilder.ts
    Pure helpers for the in-app Lesson Builder (no React, no network).

    A lesson is written as a small structured document (LessonDoc). buildLessonHtml() turns it into ONE
    self-contained HTML page in the same format as the existing interactive lessons (tap right = next step, the Arabic first and
    its English on the next tap, tap left = back, EN button = hide/show English, phase tabs, numbered slides) — and that page already speaks the
    "follow the teacher" sync contract (window.__tahleemSync), so a lesson written here syncs with
    students with no extra work. The source document is embedded in the page (#tl-src) so the builder
    can re-open and keep editing it later.
*/

export type SlideKind = "words" | "reading" | "dialogue" | "qa" | "notes" | "memorise" | "cover";

export interface LessonSlide {
  kind: SlideKind;
  phase: number;      // index into LessonDoc.phases, -1 = none
  kicker: string;     // small line above the title
  title: string;      // slide heading
  ghost: string;      // big faint background word (one short word)
  lines: string;      // the content, one item per line (format depends on kind)
  emoji?: string;     // cover only
  sub?: string;       // cover only
  hint?: string;      // cover only
}

export interface LessonDoc {
  v: 1;
  title: string;
  dir: "rtl" | "ltr";
  brandCover: boolean;                       // first slide = Tahleem Academy logo cover
  phases: { n: string; c: string }[];        // tabs along the top
  slides: LessonSlide[];
}

export const KIND_LABEL: Record<SlideKind, string> = {
  words: "Words (cards)", reading: "Reading", dialogue: "Dialogue", qa: "Questions & answers",
  notes: "Notes", memorise: "Memorise", cover: "Cover",
};

/* What the teacher types for each kind (shown as the placeholder + help). One item per line. */
export const KIND_HELP: Record<SlideKind, { how: string; example: string }> = {
  words: {
    how: "One word per line:  Arabic | English.  Shown as cards; one tap shows the Arabic, the next tap shows its English.",
    example: "مَطْعَمٌ | restaurant\nطَاوِلَةٌ | table\nكُرْسِيٌّ | chair",
  },
  reading: {
    how: "One sentence per line:  Arabic | English.  Put [square brackets] around a word to highlight it.",
    example: "ذَهَبَ أَحْمَدُ إِلَى [الْمَطْعَمِ]. | Ahmad went to the restaurant.",
  },
  dialogue: {
    how: "One line per speaker turn:  Name: Arabic | English.  Start a line with > to put it on the other side.",
    example: "النَّادِل: أَهْلًا وَسَهْلًا. | Welcome.\n> أَحْمَد: شُكْرًا. | Thank you.",
  },
  qa: {
    how: "A question line:  Question | English.  An answer line starts with =  (it appears after its question).",
    example: "**١.** مَاذَا تَقُولُ لِتَطْلُبَ الْحِسَابَ؟ | What do you say to ask for the bill?\n= الْحِسَابَ مِنْ فَضْلِكَ.",
  },
  notes: {
    how: "One note per line, written to the student. **bold** makes bold text; {{Arabic}} shows Arabic inside English text.",
    example: "**Say it aloud.** Read every word three times.\nAfter {{أُرِيدُ}} the food takes {{ـًا}}.",
  },
  memorise: {
    how: "One sentence per line to learn by heart. It appears large and centred.",
    example: "أُرِيدُ دَجَاجًا وَأَرُزًّا.\nالْحِسَابَ مِنْ فَضْلِكَ.",
  },
  cover: {
    how: "A title page. Fill the emoji, the title, a subtitle and the hint; no lines needed.",
    example: "",
  },
};

export const DEFAULT_PHASES = [
  { n: "الْمُفْرَدَاتُ", c: "#0f6b4f" },
  { n: "الْقِرَاءَةُ", c: "#a9791e" },
  { n: "الْحِوَارُ", c: "#a8533a" },
  { n: "تَدْرِيبٌ", c: "#3b5b9a" },
];

export const defaultLesson = (): LessonDoc => ({
  v: 1,
  title: "",
  dir: "rtl",
  brandCover: true,
  phases: DEFAULT_PHASES.map(p => ({ ...p })),
  slides: [
    { kind: "cover", phase: -1, kicker: "", title: "", ghost: "", lines: "", emoji: "📖", sub: "", hint: "انْقُرْ لِنَبْدَأَ ←" },
    { kind: "words", phase: 0, kicker: "", title: "", ghost: "", lines: "" },
  ],
});

export const newSlide = (kind: SlideKind, phase = 0): LessonSlide => ({
  kind, phase: kind === "cover" ? -1 : phase, kicker: "", title: "", ghost: "", lines: "",
  ...(kind === "cover" ? { emoji: "📖", sub: "", hint: "انْقُرْ لِنَبْدَأَ ←" } : {}),
});

/* ── text → safe HTML ─────────────────────────────────────────────────────── */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s: string, marks = false) => {
  let o = esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\{\{(.+?)\}\}/g, '<span class="ar">$1</span>');
  if (marks) o = o.replace(/\[(.+?)\]/g, "<mark>$1</mark>");
  return o;
};
const pair = (line: string): [string, string] => {
  const i = line.indexOf("|");
  return i < 0 ? [line.trim(), ""] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
};
const linesOf = (s: string) => s.split("\n").map(l => l.trim()).filter(Boolean);

function itemsFor(s: LessonSlide): string[] {
  const L = linesOf(s.lines);
  switch (s.kind) {
    case "words":
      return L.map(l => { const [a, e] = pair(l);
        return e ? `<div class="item vc hasen"><b>${rich(a)}</b><i>${rich(e)}</i></div>` : `<div class="item vc"><b>${rich(a)}</b></div>`; });
    case "reading":
      return L.map(l => { const [a, e] = pair(l);
        return e ? `<div class="item rd hasen"><p>${rich(a, true)}</p><div class="en">${rich(e)}</div></div>`
                 : `<div class="item rd"><p>${rich(a, true)}</p></div>`; });
    case "dialogue":
      return L.map(l => {
        const m = l.match(/^(>?)\s*([^:|]{1,30}):\s*(.*)$/);
        const me = m ? m[1] === ">" : l.startsWith(">");
        const who = m ? m[2].trim() : "";
        const [a, e] = pair(m ? m[3] : l.replace(/^>\s*/, ""));
        return `<div class="item bb${e ? " hasen" : ""}${me ? " me" : ""}">${who ? `<small>${rich(who)}</small>` : ""}<p>${rich(a)}</p>${e ? `<div class="en">${rich(e)}</div>` : ""}</div>`;
      });
    case "qa":
      return L.map(l => {
        if (l.startsWith("=")) return `<div class="item aa">${rich(l.slice(1).trim())}</div>`;
        const [q, e] = pair(l);
        return `<div class="item qq${e ? " hasen" : ""}">${rich(q)}${e ? `<div class="en">${rich(e)}</div>` : ""}</div>`;
      });
    case "notes":
      return L.map(l => `<div class="item nt">${rich(l)}</div>`);
    case "memorise":
      return L.map(l => `<div class="item dd">${rich(l)}</div>`);
    default:
      return [];
  }
}

/* ── LessonDoc → compiled slides ──────────────────────────────────────────── */
const SLOGAN = "جَعَلَهُ اللهُ عِلْمًا نَافِعًا وَعَمَلًا مُتَقَبَّلًا";

function compile(doc: LessonDoc, logoDataUri: string | null) {
  const slides: any[] = [];
  if (doc.brandCover) {
    const mark = logoDataUri
      ? `<img class="logo" alt="Tahleem Academy" src="${logoDataUri}">`
      : `<div class="brand">أكاديمية التعليم</div>`;
    slides.push({ p: -1, g: "تعليم", k: "أكاديمية التعليم", cover: `${mark}<div class="sub">${SLOGAN}</div><div class="hint">انْقُرْ لِنَبْدَأَ ←</div>`, i: [], st: [] });
  }
  doc.slides.forEach(s => {
    const p = s.phase >= 0 && s.phase < doc.phases.length ? s.phase : -1;
    if (s.kind === "cover") {
      slides.push({
        p: -1, g: esc(s.ghost || ""), k: esc(s.kicker || ""),
        cover: `${s.emoji ? `<div class="em">${esc(s.emoji)}</div>` : ""}<h1>${rich(s.title || doc.title)}</h1>${s.sub ? `<div class="sub">${rich(s.sub)}</div>` : ""}${s.hint ? `<div class="hint">${rich(s.hint)}</div>` : ""}`,
        i: [], st: [],
      });
    } else {
      const items = itemsFor(s);
      // Steps in click order: item n → its Arabic (2n), then, if it has English, its meaning (2n+1).
      const st: number[] = [];
      items.forEach((x, n) => { st.push(n * 2); if (/^<div class="item[^"]*\bhasen\b/.test(x)) st.push(n * 2 + 1); });
      slides.push({ p, g: esc(s.ghost || ""), k: esc(s.kicker || ""), t: rich(s.title || ""), grid: s.kind === "words" ? 1 : 0, i: items, st });
    }
  });
  if (!slides.length) slides.push({ p: -1, g: "", k: "", t: "", i: [], st: [] });
  return { phases: doc.phases.map(p => ({ n: esc(p.n), c: /^#[0-9a-fA-F]{3,8}$/.test(p.c) ? p.c : "#0f6b4f" })), slides };
}

/* JSON that is safe inside <script type="application/json"> */
const safeJson = (o: any) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const CSS = `:root{--bg:#ffffff;--card:#fff;--ink:#182b1d;--dim:rgba(24,43,29,.62);--line:rgba(15,45,31,.16);--gold:#a9791e;--wash:rgba(15,45,31,.05);--ph:#0f6b4f;--bar:rgba(255,255,255,.85);box-sizing:border-box}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'Cairo',system-ui,sans-serif}
#top{position:fixed;top:0;left:0;right:0;z-index:6;padding-top:env(safe-area-inset-top,0px);background:var(--bar);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
#tabs{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;scrollbar-width:none}
#tabs button{flex:1 0 auto;font:700 15px 'Amiri',serif;padding:7px 16px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;white-space:nowrap}
#tabs button.on{color:#fff;border-color:transparent}
#prog{height:3px;background:var(--line)}#prog i{display:block;height:100%;width:0;background:var(--ph);transition:width .4s}
#ghost{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
#ghost span{font:700 min(36vw,330px)/1 'Amiri',serif;color:var(--gold);opacity:.07;white-space:nowrap}
#wrap{position:fixed;inset:calc(78px + env(safe-area-inset-top,0px)) 0 calc(66px + env(safe-area-inset-bottom,0px)) 0;display:flex;justify-content:center;padding:10px;z-index:3}
#stage{width:min(100%,900px);background:var(--card);border:1px solid var(--line);border-top:5px solid var(--ph);border-radius:14px;padding:22px 20px;box-shadow:0 6px 24px rgba(15,45,31,.08);overflow-y:auto;cursor:pointer;scrollbar-width:none;display:flex;flex-direction:column}
#stage::-webkit-scrollbar{display:none}
.kick{font:700 14px 'Amiri',serif;color:var(--ph);letter-spacing:.02em}
h2{font:700 clamp(22px,5vw,30px)/1.5 'Amiri',serif;margin:2px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line)}
h1{font:700 clamp(32px,9vw,56px)/1.5 'Amiri',serif;color:var(--gold);margin:0;text-align:center}
.sub{direction:ltr;text-align:center;color:var(--dim);margin-top:6px}
.cover{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center}
.cover .em{font-size:64px}.hint{background:var(--wash);border:1px dashed var(--gold);border-radius:10px;padding:10px 18px;font:700 18px 'Amiri',serif}
.content{display:flex;flex-direction:column;gap:12px}
.content.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:10px}
.item{opacity:0;transform:translateY(14px) scale(.97);transition:opacity .45s,transform .45s;pointer-events:none;visibility:hidden}
.item.shown{opacity:1;transform:none;visibility:visible;pointer-events:auto}
.vc{background:var(--wash);border:1px solid var(--line);border-top:3px solid var(--ph);border-radius:12px;padding:12px 8px;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:2px}
.vc b{font:700 clamp(24px,5.6vw,32px)/1.5 'Amiri',serif;color:var(--ph)}
.vc i{font-style:normal;direction:ltr;font-weight:600;font-size:15px;color:var(--ink)}
.rd,.qq,.nt,.dd{background:var(--wash);border-right:4px solid var(--ph);border-radius:8px;padding:10px 16px}
.rd p,.bb p{font:700 clamp(21px,5vw,27px)/2 'Amiri',serif;margin:0}
mark{background:rgba(169,121,30,.18);color:var(--ph);border-radius:5px;padding:0 5px;font-weight:700}
.en{direction:ltr;text-align:left;color:var(--dim);font-size:clamp(14px,3.6vw,16px);line-height:1.7}
/* The meaning stays hidden until its own click: first click = Arabic, next click = English */
.hasen .en,.vc.hasen i{display:none}
.hasen.rv .en{display:block}
.vc.hasen.rv i{display:block}
.item.cur{outline:2px solid rgba(169,121,30,.5);outline-offset:3px}
.hasen.cur.rv .en,.vc.hasen.cur.rv i{animation:fi .35s ease}
@keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
#bar #all{font:700 12px 'Cairo',sans-serif;min-width:40px;direction:ltr}#bar #all.m1{background:#182b1d;color:#fff;border-color:#182b1d;text-decoration:line-through}#bar #all.m2{background:var(--gold);color:#fff;border-color:var(--gold)}
body.hen .en,body.hen .vc.hasen i{display:none!important}body.hen .item.hasen::after{display:none!important}
#toast{position:fixed;left:50%;bottom:calc(76px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(24,43,29,.92);color:#fff;font:600 13px 'Cairo',sans-serif;padding:7px 14px;border-radius:99px;opacity:0;pointer-events:none;transition:opacity .25s;z-index:9;direction:ltr;white-space:nowrap}#toast.on{opacity:1}
.item.hasen:not(.rv)::after{content:'EN';display:inline-block;align-self:center;margin-top:4px;padding:0 9px;font:700 11px/18px 'Cairo',sans-serif;color:var(--gold);border:1px solid var(--gold);border-radius:99px;opacity:.85;direction:ltr}
.bb{max-width:88%;border-radius:16px;padding:8px 16px;background:var(--wash);border:1px solid var(--line);align-self:flex-start;border-top-right-radius:4px}
.bb.me{align-self:flex-end;background:rgba(169,121,30,.12);border-top-right-radius:16px;border-top-left-radius:4px}
.bb small{font:700 13px 'Amiri',serif;color:var(--ph)}
.qq{border-right-color:#a8533a;font:700 clamp(19px,4.6vw,23px)/2 'Amiri',serif}
.aa{font:700 clamp(21px,5vw,26px)/2 'Amiri',serif;color:var(--ph);background:rgba(15,107,79,.09);border-radius:8px;padding:10px 16px;text-align:center}
.nt{direction:ltr;text-align:left;line-height:1.7;font-size:clamp(14.5px,3.8vw,17px)}.nt .ar{font:700 1.25em 'Amiri',serif;color:var(--ph);direction:rtl}
.dd{font:700 clamp(22px,5.4vw,28px)/2 'Amiri',serif;text-align:center}
.brand{font:700 clamp(34px,9vw,54px)/1.6 'Amiri',serif;color:var(--gold)}
.logo{width:min(78%,340px);height:auto;display:block;margin:0 auto}
#bar{position:fixed;bottom:0;left:0;right:0;z-index:6;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:var(--bar);backdrop-filter:blur(8px);border-top:1px solid var(--line);display:flex;gap:6px;align-items:center}
#bar button{font:700 18px 'Cairo',sans-serif;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;min-width:40px;height:40px}
#nums{flex:1;display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;padding:2px}
#nums button{flex:0 0 auto;font-size:14px;border-bottom:3px solid var(--c)}
#nums button.on{background:var(--c);color:#fff;border-color:var(--c)}
#cnt{font:600 12px 'Cairo';color:var(--dim);min-width:34px;text-align:center;direction:ltr}
@media print{#top,#bar{display:none}html,body{overflow:visible;height:auto}#wrap{position:static}.item{opacity:1;visibility:visible;transform:none}.hasen .en{display:block}.vc.hasen i{display:block}.item.hasen::after{display:none!important}}`;

/* The page's own script. Plain strings only (no template literals) because it is embedded in a TS string. */
const RUNTIME = [
"var DATA=JSON.parse(document.getElementById('tl-data').textContent);",
"var PH=DATA.phases,S=DATA.slides,si=0,ii=0,EM=0;/* EM = English mode: 0 step by step, 1 hidden, 2 all shown */",
"function $(id){return document.getElementById(id)}",
"var stage=$('stage');",
"function col(p){return p<0?'#0f6b4f':(PH[p]?PH[p].c:'#0f6b4f')}",
"function steps(s){return s.st||[]}",
"$('tabs').innerHTML=PH.map(function(p,i){return '<button data-p=\"'+i+'\">'+p.n+'</button>'}).join('');",
"$('nums').innerHTML=S.map(function(s,i){return '<button data-n=\"'+i+'\" style=\"--c:'+col(s.p)+'\">'+(i+1)+'</button>'}).join('');",
"function render(){",
" var s=S[si],c=col(s.p),st=steps(s);document.documentElement.style.setProperty('--ph',c);",
" $('gh').textContent=s.g||'';",
" /* each click is one step: an item's Arabic first, then (if it has one) its English */",
" var seen={};for(var k=0;k<ii&&k<st.length;k++)seen[st[k]]=1;",
" var cur=ii>0&&ii<=st.length?Math.floor(st[ii-1]/2):-1;",
" var h='<div class=\"kick\">'+(s.k||'')+'</div>';",
" if(s.cover)h+='<div class=\"cover\">'+s.cover+'</div>';",
" else h+='<h2>'+(s.t||'')+'</h2><div class=\"content'+(s.grid?' g':'')+'\">'+s.i.map(function(x,i){return x.replace('class=\"item','class=\"item'+(seen[i*2]?' shown':'')+((EM!==1&&(EM===2?seen[i*2]:seen[i*2+1]))?' rv':'')+(i===cur?' cur':''))}).join('')+'</div>';",
" stage.innerHTML=h;",
" var sh=stage.querySelector('.item.cur');if(sh)sh.scrollIntoView({behavior:'smooth',block:'nearest'});",
" document.querySelectorAll('#tabs button').forEach(function(b,i){var on=i===s.p;b.classList.toggle('on',on);b.style.background=on?PH[i].c:''});",
" document.querySelectorAll('#nums button').forEach(function(b,i){b.classList.toggle('on',i===si)});",
" var ab=document.querySelector('#nums button.on');if(ab)ab.scrollIntoView({inline:'center',block:'nearest'});",
" document.querySelector('#prog i').style.width=((si+(st.length?ii/st.length:1))/S.length*100)+'%';",
" var tot=st.length,done=ii;if(EM===1){tot=0;done=0;for(var q=0;q<st.length;q++){if(st[q]%2===0){tot++;if(q<ii)done++}}}",
" $('cnt').textContent=tot?done+'/'+tot:'';",
" document.body.classList.toggle('hen',EM===1);$('all').className=EM?'m'+EM:'';",
" var dots=document.querySelectorAll('#syncdots .dot');for(var d=0;d<dots.length;d++)dots[d].classList.toggle('active',d===si);",
"}",
"function isEn(s,k){return (steps(s)[k-1]||0)%2===1}",
"/* with English hidden, English steps are stepped over (the step numbers stay the same, so live-sync still lines up) */",
"function adv(){var s=S[si],n=steps(s).length,k=ii+1;if(EM===1)while(k<=n&&isEn(s,k))k++;",
" if(k<=n){ii=k;render()}else if(si<S.length-1){si++;ii=0;render()}else if(ii<n){ii=n;render()}}",
"function back(){var s=S[si],k=ii-1;if(EM===1)while(k>0&&isEn(s,k))k--;",
" if(ii>0){ii=Math.max(0,k);render()}else if(si>0){si--;ii=steps(S[si]).length;render()}}",
"function go(n){si=n;ii=0;render()}",
"/* tap the right half = next step, tap the left half = back one step */",
"stage.onclick=function(e){",
" /* taps sent by the live-sync (not a real finger): only take the next step on THIS slide, never change slide */",
" if(!e.isTrusted){if(ii<steps(S[si]).length){ii++;render()}return}",
" var r=stage.getBoundingClientRect();(e.clientX-r.left>r.width/2)?adv():back();",
"};",
"$('nx').onclick=adv;$('pv').onclick=back;",
"var tt;function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},1600)}",
"$('all').onclick=function(){EM=(EM+1)%3;toast(['English: shown step by step','English: hidden','English: all shown'][EM]);render()};",
"$('nums').onclick=function(e){var b=e.target.closest('button');if(b)go(+b.dataset.n)};",
"$('tabs').onclick=function(e){var b=e.target.closest('button');if(b){var k=S.findIndex(function(s){return s.p===+b.dataset.p});if(k>=0)go(k)}};",
"document.addEventListener('keydown',function(e){if(['Space','ArrowLeft','Enter'].indexOf(e.code)>=0){e.preventDefault();adv()}else if(e.code==='ArrowRight'){e.preventDefault();back()}});",
"/* ── live-sync (Tahleem Academy \"follow the teacher\") ── */",
"window.__tahleemSync={",
" get:function(){return {step:si,total:S.length,reveal:ii+EM*1000}},",
" goTo:function(n,k){k=k|0;var m=Math.floor(k/1000);k=k%1000;n=Math.max(0,Math.min(S.length-1,n|0));k=Math.max(0,Math.min(steps(S[n]).length,k));m=m>2?0:m;if(n!==si||k!==ii||m!==EM){si=n;ii=k;EM=m;render()}}",
"};",
"/* fallback for older app versions: hidden slide markers + hidden Next/Previous that move one whole slide */",
"var sd=document.createElement('div');sd.id='syncdots';sd.style.display='none';",
"sd.innerHTML=S.map(function(){return '<i class=\"dot\"></i>'}).join('');document.body.appendChild(sd);",
"[['Next',function(){if(si<S.length-1)go(si+1)}],['Previous',function(){if(si>0)go(si-1)}]].forEach(function(a){var x=document.createElement('button');x.textContent=a[0];x.style.display='none';x.onclick=a[1];sd.appendChild(x)});",
"render();",
].join("\n");

export function buildLessonHtml(doc: LessonDoc, logoDataUri: string | null = null): string {
  const data = compile(doc, logoDataUri);
  const title = esc(doc.title || "Lesson");
  return `<!DOCTYPE html>
<html lang="${doc.dir === "rtl" ? "ar" : "en"}" dir="${doc.dir}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title} | أكاديمية التعليم</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
${CSS}
</style></head><body>
<div id="top"><div id="tabs"></div><div id="prog"><i></i></div></div>
<div id="ghost"><span id="gh"></span></div>
<div id="wrap"><div id="stage"></div></div>
<div id="toast"></div>
<div id="bar"><button id="pv" aria-label="Previous">›</button><div id="nums"></div><span id="cnt"></span><button id="all" aria-label="English: step by step / hidden / all shown" title="English: step by step → hidden → all shown">EN</button><button id="nx" aria-label="Next">‹</button></div>
<script type="application/json" id="tl-data">${safeJson(data)}</script>
<script type="application/json" id="tl-src">${safeJson(doc)}</script>
<script>
${RUNTIME}
</script></body></html>`;
}

/* Re-open a lesson that was made in the builder: read the source document back out of the saved page. */
export function extractLessonSource(html: string): LessonDoc | null {
  const m = html.match(/<script type="application\/json" id="tl-src">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    return d && d.v === 1 && Array.isArray(d.slides) ? (d as LessonDoc) : null;
  } catch { return null; }
}

/* Files made by the builder carry this suffix, so the materials list can offer "Edit in Lesson Builder". */
export const LESSON_FILE_SUFFIX = ".tlesson.html";
export const isBuilderLessonFile = (fileUrl?: string | null) =>
  String(fileUrl || "").split("?")[0].toLowerCase().endsWith(LESSON_FILE_SUFFIX);


/* ── Lessons stored directly in the database ───────────────────────────────────────────────
   A lesson can live in subject_materials.content as its source document (JSON) — no file in storage,
   no upload. Every viewer builds the same interactive page from it on the fly. */
export function parseInlineLesson(content?: string | null): LessonDoc | null {
  if (typeof content !== "string" || !content.startsWith('{"v":1')) return null;
  try {
    const d = JSON.parse(content);
    return d && d.v === 1 && Array.isArray(d.slides) ? (d as LessonDoc) : null;
  } catch { return null; }
}
/* True for a database-stored lesson row — or for the copy broadcast to students in a live class (content is
   left out of the broadcast and fetched by id, so the message stays small). */
export const isInlineLessonRow = (m: any): boolean =>
  !!m && (m.inline_lesson === true || (typeof m.content === "string" && m.content.startsWith('{"v":1')));
export function inlineLessonHtml(content?: string | null): string | null {
  const d = parseInlineLesson(content);
  if (!d) return null;
  const logo = typeof window !== "undefined" ? `${window.location.origin}/brand-logo.png` : null;
  return buildLessonHtml(d, logo);
}
export function serializeLesson(doc: LessonDoc): string {
  const { v: _v, ...rest } = doc;
  return JSON.stringify({ v: 1, ...rest });
}
