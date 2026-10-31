/**
 * Musabaqah question helpers: full surah table, guide parsing, and
 * verse-text fetching so auto-fill can write out the actual ayat
 * (no surah:ayah numbers in the question lines).
 */

const RAW: [string, string, number][] = [
  ["Al-Fatiha","الفاتحة",7],["Al-Baqarah","البقرة",286],["Al-Imran","آل عمران",200],["An-Nisa","النساء",176],
  ["Al-Ma'idah","المائدة",120],["Al-An'am","الأنعام",165],["Al-A'raf","الأعراف",206],["Al-Anfal","الأنفال",75],
  ["At-Tawbah","التوبة",129],["Yunus","يونس",109],["Hud","هود",123],["Yusuf","يوسف",111],["Ar-Ra'd","الرعد",43],
  ["Ibrahim","إبراهيم",52],["Al-Hijr","الحجر",99],["An-Nahl","النحل",128],["Al-Isra","الإسراء",111],
  ["Al-Kahf","الكهف",110],["Maryam","مريم",98],["Ta-Ha","طه",135],["Al-Anbiya","الأنبياء",112],["Al-Hajj","الحج",78],
  ["Al-Mu'minun","المؤمنون",118],["An-Nur","النور",64],["Al-Furqan","الفرقان",77],["Ash-Shu'ara","الشعراء",227],
  ["An-Naml","النمل",93],["Al-Qasas","القصص",88],["Al-Ankabut","العنكبوت",69],["Ar-Rum","الروم",60],
  ["Luqman","لقمان",34],["As-Sajdah","السجدة",30],["Al-Ahzab","الأحزاب",73],["Saba","سبأ",54],["Fatir","فاطر",45],
  ["Ya-Sin","يس",83],["As-Saffat","الصافات",182],["Sad","ص",88],["Az-Zumar","الزمر",75],["Ghafir","غافر",85],
  ["Fussilat","فصلت",54],["Ash-Shura","الشورى",53],["Az-Zukhruf","الزخرف",89],["Ad-Dukhan","الدخان",59],
  ["Al-Jathiyah","الجاثية",37],["Al-Ahqaf","الأحقاف",35],["Muhammad","محمد",38],["Al-Fath","الفتح",29],
  ["Al-Hujurat","الحجرات",18],["Qaf","ق",45],["Adh-Dhariyat","الذاريات",60],["At-Tur","الطور",49],
  ["An-Najm","النجم",62],["Al-Qamar","القمر",55],["Ar-Rahman","الرحمن",78],["Al-Waqi'ah","الواقعة",96],
  ["Al-Hadid","الحديد",29],["Al-Mujadilah","المجادلة",22],["Al-Hashr","الحشر",24],["Al-Mumtahanah","الممتحنة",13],
  ["As-Saff","الصف",14],["Al-Jumu'ah","الجمعة",11],["Al-Munafiqun","المنافقون",11],["At-Taghabun","التغابن",18],
  ["At-Talaq","الطلاق",12],["At-Tahrim","التحريم",12],["Al-Mulk","الملك",30],["Al-Qalam","القلم",52],
  ["Al-Haqqah","الحاقة",52],["Al-Ma'arij","المعارج",44],["Nuh","نوح",28],["Al-Jinn","الجن",28],
  ["Al-Muzzammil","المزمل",20],["Al-Muddaththir","المدثر",56],["Al-Qiyamah","القيامة",40],["Al-Insan","الإنسان",31],
  ["Al-Mursalat","المرسلات",50],["An-Naba'","النبأ",40],["An-Nazi'at","النازعات",46],["'Abasa","عبس",42],
  ["At-Takwir","التكوير",29],["Al-Infitar","الانفطار",19],["Al-Mutaffifin","المطففين",36],["Al-Inshiqaq","الانشقاق",25],
  ["Al-Buruj","البروج",22],["At-Tariq","الطارق",17],["Al-A'la","الأعلى",19],["Al-Ghashiyah","الغاشية",26],
  ["Al-Fajr","الفجر",30],["Al-Balad","البلد",20],["Ash-Shams","الشمس",15],["Al-Layl","الليل",21],
  ["Ad-Duha","الضحى",11],["Ash-Sharh","الشرح",8],["At-Tin","التين",8],["Al-'Alaq","العلق",19],
  ["Al-Qadr","القدر",5],["Al-Bayyinah","البينة",8],["Az-Zalzalah","الزلزلة",8],["Al-'Adiyat","العاديات",11],
  ["Al-Qari'ah","القارعة",11],["At-Takathur","التكاثر",8],["Al-'Asr","العصر",3],["Al-Humazah","الهمزة",9],
  ["Al-Fil","الفيل",5],["Quraysh","قريش",4],["Al-Ma'un","الماعون",7],["Al-Kawthar","الكوثر",3],
  ["Al-Kafirun","الكافرون",6],["An-Nasr","النصر",3],["Al-Masad","المسد",5],["Al-Ikhlas","الإخلاص",4],
  ["Al-Falaq","الفلق",5],["An-Nas","الناس",6],
];

export interface SurahInfo { n: number; en: string; ar: string; v: number }
export const ALL_SURAHS: SurahInfo[] = RAW.map(([en, ar, v], i) => ({ n: i + 1, en, ar, v }));

const stripDiacritics = (s: string) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
const normAr = (s: string) =>
  stripDiacritics(s).replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, "").replace(/^ال/, "");
const normEn = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, "")
    .replace(/^(al|an|ash|at|ad|as|ar|az|adh|ath)(?=.{3})/, "")
    .replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u").replace(/ii/g, "i").replace(/uu/g, "u")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/ph/g, "f").replace(/q/g, "k").replace(/h$/, "");

export function findSurah(token: string): SurahInfo | null {
  const t = token.trim().replace(/^(surah|sura|soorah|سورة|سوره)\s*/i, "").trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return ALL_SURAHS.find(s => s.n === parseInt(t)) ?? null;
  if (/[\u0600-\u06FF]/.test(t)) {
    const a = normAr(t);
    return ALL_SURAHS.find(s => normAr(s.ar) === a)
      ?? (a.length >= 2 ? ALL_SURAHS.find(s => normAr(s.ar).includes(a)) : null) ?? null;
  }
  const e = normEn(t);
  if (e.length < 2) return null;
  return ALL_SURAHS.find(s => normEn(s.en) === e)
    ?? (e.length >= 3 ? ALL_SURAHS.find(s => normEn(s.en).startsWith(e)) : null)
    ?? (e.length >= 3 ? ALL_SURAHS.find(s => normEn(s.en).includes(e)) : null) ?? null;
}

export interface GuideItem { raw: string; ok: boolean; surah?: SurahInfo; from?: number; to?: number }

/** "Ikhlas, Falaq 1-3, 112, An-Nas:2-4, الفاتحة" → structured items */
export function parseGuide(text: string): GuideItem[] {
  return (text || "").split(/[,;\n،]+/).map(s => s.trim()).filter(Boolean).map(raw => {
    let name = raw, from: number | undefined, to: number | undefined;
    let m = raw.match(/^(\d+)\s*(?::\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
    if (m) {
      name = m[1]; if (m[2]) { from = +m[2]; to = m[3] ? +m[3] : +m[2]; }
    } else {
      m = raw.match(/^(.*?[^\d\s:])\s*[: ]\s*(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (m) { name = m[1]; from = +m[2]; to = m[3] ? +m[3] : +m[2]; }
    }
    const surah = findSurah(name);
    if (!surah) return { raw, ok: false };
    if (from !== undefined && to !== undefined) {
      from = Math.max(1, Math.min(from, surah.v)); to = Math.max(1, Math.min(to, surah.v));
      if (from > to) [from, to] = [to, from];
    }
    return { raw, ok: true, surah, from, to };
  });
}

export function guideToAyahs(items: GuideItem[]): { surah: number; ayah: number }[] {
  const out: { surah: number; ayah: number }[] = []; const seen = new Set<string>();
  for (const it of items) {
    if (!it.ok || !it.surah) continue;
    const a0 = it.from ?? 1, a1 = it.to ?? it.surah.v;
    for (let a = a0; a <= a1; a++) { const k = `${it.surah.n}:${a}`; if (!seen.has(k)) { seen.add(k); out.push({ surah: it.surah.n, ayah: a }); } }
  }
  return out;
}

// ── Verse text ────────────────────────────────────────────────────────────
const surahCache = new Map<number, string[]>();

const stripBismillah = (surah: number, ayah: number, text: string) => {
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.trim().split(/\s+/);
  return stripDiacritics(words[0] || "").startsWith("بسم") && words.length > 4 ? words.slice(4).join(" ") : text;
};

export async function fetchSurahVerses(n: number): Promise<string[]> {
  const hit = surahCache.get(n); if (hit) return hit;
  const r = await fetch(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
  const d = await r.json();
  if (d?.code !== 200 || !Array.isArray(d?.data?.ayahs)) throw new Error("verse fetch failed");
  const verses: string[] = d.data.ayahs.map((a: any) => stripBismillah(n, a.numberInSurah, String(a.text).trim()));
  surahCache.set(n, verses);
  return verses;
}

/** Resolve pairs to written-out verse text (parallel per distinct surah). */
export async function resolveVerseTexts(pairs: { surah: number; ayah: number }[]): Promise<string[]> {
  const surahs = [...new Set(pairs.map(p => p.surah))];
  await Promise.all(surahs.map(fetchSurahVerses));
  return pairs.map(p => (surahCache.get(p.surah)?.[p.ayah - 1] ?? "").replace(/\s+/g, " ").trim());
}

export const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
export const isMostlyArabic = (s: string) => {
  const ar = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return ar > 0 && ar >= lat;
};
