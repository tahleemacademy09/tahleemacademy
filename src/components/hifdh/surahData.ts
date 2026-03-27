// src/components/hifdh/surahData.ts
// FIX 1: Added num/nameAr/juz/page fields (components use these)
// FIX 2: audioUrl now uses everyayah.com with correct padded format

export interface Surah {
  id: number;
  num: number;          // alias for id — used by HifdhRecitation, HifdhMemorization, HifdhExercise
  name: string;
  arabicName: string;
  nameAr: string;       // alias for arabicName — used by all Hifdh components
  verses: number;
  juz: number;          // starting juz — displayed in Recitation picker badges
  page: number;         // starting page (Madina Mushaf) — displayed in Recitation picker
}

export const SURAHS: Surah[] = [
  { id:   1, num:   1, name: "Al-Fatihah",     arabicName: "الفاتحة",      nameAr: "الفاتحة",      verses:   7, juz:  1, page:   1 },
  { id:   2, num:   2, name: "Al-Baqarah",     arabicName: "البقرة",       nameAr: "البقرة",       verses: 286, juz:  1, page:   2 },
  { id:   3, num:   3, name: "Aal-E-Imran",    arabicName: "آل عمران",     nameAr: "آل عمران",     verses: 200, juz:  3, page:  50 },
  { id:   4, num:   4, name: "An-Nisa",        arabicName: "النساء",       nameAr: "النساء",       verses: 176, juz:  4, page:  77 },
  { id:   5, num:   5, name: "Al-Ma'idah",     arabicName: "المائدة",      nameAr: "المائدة",      verses: 120, juz:  6, page: 106 },
  { id:   6, num:   6, name: "Al-An'am",       arabicName: "الأنعام",      nameAr: "الأنعام",      verses: 165, juz:  7, page: 128 },
  { id:   7, num:   7, name: "Al-A'raf",       arabicName: "الأعراف",      nameAr: "الأعراف",      verses: 206, juz:  8, page: 151 },
  { id:   8, num:   8, name: "Al-Anfal",       arabicName: "الأنفال",      nameAr: "الأنفال",      verses:  75, juz:  9, page: 177 },
  { id:   9, num:   9, name: "At-Tawbah",      arabicName: "التوبة",       nameAr: "التوبة",       verses: 129, juz: 10, page: 187 },
  { id:  10, num:  10, name: "Yunus",          arabicName: "يونس",         nameAr: "يونس",         verses: 109, juz: 11, page: 208 },
  { id:  11, num:  11, name: "Hud",            arabicName: "هود",          nameAr: "هود",          verses: 123, juz: 11, page: 221 },
  { id:  12, num:  12, name: "Yusuf",          arabicName: "يوسف",         nameAr: "يوسف",         verses: 111, juz: 12, page: 235 },
  { id:  13, num:  13, name: "Ar-Ra'd",        arabicName: "الرعد",        nameAr: "الرعد",        verses:  43, juz: 13, page: 249 },
  { id:  14, num:  14, name: "Ibrahim",        arabicName: "إبراهيم",      nameAr: "إبراهيم",      verses:  52, juz: 13, page: 255 },
  { id:  15, num:  15, name: "Al-Hijr",        arabicName: "الحجر",        nameAr: "الحجر",        verses:  99, juz: 14, page: 262 },
  { id:  16, num:  16, name: "An-Nahl",        arabicName: "النحل",        nameAr: "النحل",        verses: 128, juz: 14, page: 267 },
  { id:  17, num:  17, name: "Al-Isra",        arabicName: "الإسراء",      nameAr: "الإسراء",      verses: 111, juz: 15, page: 282 },
  { id:  18, num:  18, name: "Al-Kahf",        arabicName: "الكهف",        nameAr: "الكهف",        verses: 110, juz: 15, page: 293 },
  { id:  19, num:  19, name: "Maryam",         arabicName: "مريم",         nameAr: "مريم",         verses:  98, juz: 16, page: 305 },
  { id:  20, num:  20, name: "Ta-Ha",          arabicName: "طه",           nameAr: "طه",           verses: 135, juz: 16, page: 312 },
  { id:  21, num:  21, name: "Al-Anbiya",      arabicName: "الأنبياء",     nameAr: "الأنبياء",     verses: 112, juz: 17, page: 322 },
  { id:  22, num:  22, name: "Al-Hajj",        arabicName: "الحج",         nameAr: "الحج",         verses:  78, juz: 17, page: 332 },
  { id:  23, num:  23, name: "Al-Mu'minun",    arabicName: "المؤمنون",     nameAr: "المؤمنون",     verses: 118, juz: 18, page: 342 },
  { id:  24, num:  24, name: "An-Nur",         arabicName: "النور",        nameAr: "النور",        verses:  64, juz: 18, page: 350 },
  { id:  25, num:  25, name: "Al-Furqan",      arabicName: "الفرقان",      nameAr: "الفرقان",      verses:  77, juz: 18, page: 359 },
  { id:  26, num:  26, name: "Ash-Shu'ara",    arabicName: "الشعراء",      nameAr: "الشعراء",      verses: 227, juz: 19, page: 367 },
  { id:  27, num:  27, name: "An-Naml",        arabicName: "النمل",        nameAr: "النمل",        verses:  93, juz: 19, page: 377 },
  { id:  28, num:  28, name: "Al-Qasas",       arabicName: "القصص",        nameAr: "القصص",        verses:  88, juz: 20, page: 385 },
  { id:  29, num:  29, name: "Al-Ankabut",     arabicName: "العنكبوت",     nameAr: "العنكبوت",     verses:  69, juz: 20, page: 396 },
  { id:  30, num:  30, name: "Ar-Rum",         arabicName: "الروم",        nameAr: "الروم",        verses:  60, juz: 21, page: 404 },
  { id:  31, num:  31, name: "Luqman",         arabicName: "لقمان",        nameAr: "لقمان",        verses:  34, juz: 21, page: 411 },
  { id:  32, num:  32, name: "As-Sajdah",      arabicName: "السجدة",       nameAr: "السجدة",       verses:  30, juz: 21, page: 415 },
  { id:  33, num:  33, name: "Al-Ahzab",       arabicName: "الأحزاب",      nameAr: "الأحزاب",      verses:  73, juz: 21, page: 418 },
  { id:  34, num:  34, name: "Saba",           arabicName: "سبأ",          nameAr: "سبأ",          verses:  54, juz: 22, page: 428 },
  { id:  35, num:  35, name: "Fatir",          arabicName: "فاطر",         nameAr: "فاطر",         verses:  45, juz: 22, page: 434 },
  { id:  36, num:  36, name: "Ya-Sin",         arabicName: "يس",           nameAr: "يس",           verses:  83, juz: 22, page: 440 },
  { id:  37, num:  37, name: "As-Saffat",      arabicName: "الصافات",      nameAr: "الصافات",      verses: 182, juz: 23, page: 446 },
  { id:  38, num:  38, name: "Sad",            arabicName: "ص",            nameAr: "ص",            verses:  88, juz: 23, page: 453 },
  { id:  39, num:  39, name: "Az-Zumar",       arabicName: "الزمر",        nameAr: "الزمر",        verses:  75, juz: 23, page: 458 },
  { id:  40, num:  40, name: "Ghafir",         arabicName: "غافر",         nameAr: "غافر",         verses:  85, juz: 24, page: 467 },
  { id:  41, num:  41, name: "Fussilat",       arabicName: "فصلت",         nameAr: "فصلت",         verses:  54, juz: 24, page: 477 },
  { id:  42, num:  42, name: "Ash-Shura",      arabicName: "الشورى",       nameAr: "الشورى",       verses:  53, juz: 25, page: 483 },
  { id:  43, num:  43, name: "Az-Zukhruf",     arabicName: "الزخرف",       nameAr: "الزخرف",       verses:  89, juz: 25, page: 489 },
  { id:  44, num:  44, name: "Ad-Dukhan",      arabicName: "الدخان",       nameAr: "الدخان",       verses:  59, juz: 25, page: 496 },
  { id:  45, num:  45, name: "Al-Jathiyah",    arabicName: "الجاثية",      nameAr: "الجاثية",      verses:  37, juz: 25, page: 499 },
  { id:  46, num:  46, name: "Al-Ahqaf",       arabicName: "الأحقاف",      nameAr: "الأحقاف",      verses:  35, juz: 26, page: 502 },
  { id:  47, num:  47, name: "Muhammad",       arabicName: "محمد",         nameAr: "محمد",         verses:  38, juz: 26, page: 507 },
  { id:  48, num:  48, name: "Al-Fath",        arabicName: "الفتح",        nameAr: "الفتح",        verses:  29, juz: 26, page: 511 },
  { id:  49, num:  49, name: "Al-Hujurat",     arabicName: "الحجرات",      nameAr: "الحجرات",      verses:  18, juz: 26, page: 515 },
  { id:  50, num:  50, name: "Qaf",            arabicName: "ق",            nameAr: "ق",            verses:  45, juz: 26, page: 518 },
  { id:  51, num:  51, name: "Adh-Dhariyat",   arabicName: "الذاريات",     nameAr: "الذاريات",     verses:  60, juz: 26, page: 520 },
  { id:  52, num:  52, name: "At-Tur",         arabicName: "الطور",        nameAr: "الطور",        verses:  49, juz: 27, page: 523 },
  { id:  53, num:  53, name: "An-Najm",        arabicName: "النجم",        nameAr: "النجم",        verses:  62, juz: 27, page: 526 },
  { id:  54, num:  54, name: "Al-Qamar",       arabicName: "القمر",        nameAr: "القمر",        verses:  55, juz: 27, page: 528 },
  { id:  55, num:  55, name: "Ar-Rahman",      arabicName: "الرحمن",       nameAr: "الرحمن",       verses:  78, juz: 27, page: 531 },
  { id:  56, num:  56, name: "Al-Waqi'ah",     arabicName: "الواقعة",      nameAr: "الواقعة",      verses:  96, juz: 27, page: 534 },
  { id:  57, num:  57, name: "Al-Hadid",       arabicName: "الحديد",       nameAr: "الحديد",       verses:  29, juz: 27, page: 537 },
  { id:  58, num:  58, name: "Al-Mujadila",    arabicName: "المجادلة",     nameAr: "المجادلة",     verses:  22, juz: 28, page: 542 },
  { id:  59, num:  59, name: "Al-Hashr",       arabicName: "الحشر",        nameAr: "الحشر",        verses:  24, juz: 28, page: 545 },
  { id:  60, num:  60, name: "Al-Mumtahanah",  arabicName: "الممتحنة",     nameAr: "الممتحنة",     verses:  13, juz: 28, page: 549 },
  { id:  61, num:  61, name: "As-Saff",        arabicName: "الصف",         nameAr: "الصف",         verses:  14, juz: 28, page: 551 },
  { id:  62, num:  62, name: "Al-Jumu'ah",     arabicName: "الجمعة",       nameAr: "الجمعة",       verses:  11, juz: 28, page: 553 },
  { id:  63, num:  63, name: "Al-Munafiqun",   arabicName: "المنافقون",    nameAr: "المنافقون",    verses:  11, juz: 28, page: 554 },
  { id:  64, num:  64, name: "At-Taghabun",    arabicName: "التغابن",      nameAr: "التغابن",      verses:  18, juz: 28, page: 556 },
  { id:  65, num:  65, name: "At-Talaq",       arabicName: "الطلاق",       nameAr: "الطلاق",       verses:  12, juz: 28, page: 558 },
  { id:  66, num:  66, name: "At-Tahrim",      arabicName: "التحريم",      nameAr: "التحريم",      verses:  12, juz: 28, page: 560 },
  { id:  67, num:  67, name: "Al-Mulk",        arabicName: "الملك",        nameAr: "الملك",        verses:  30, juz: 29, page: 562 },
  { id:  68, num:  68, name: "Al-Qalam",       arabicName: "القلم",        nameAr: "القلم",        verses:  52, juz: 29, page: 566 },
  { id:  69, num:  69, name: "Al-Haqqah",      arabicName: "الحاقة",       nameAr: "الحاقة",       verses:  52, juz: 29, page: 568 },
  { id:  70, num:  70, name: "Al-Ma'arij",     arabicName: "المعارج",      nameAr: "المعارج",      verses:  44, juz: 29, page: 570 },
  { id:  71, num:  71, name: "Nuh",            arabicName: "نوح",          nameAr: "نوح",          verses:  28, juz: 29, page: 572 },
  { id:  72, num:  72, name: "Al-Jinn",        arabicName: "الجن",         nameAr: "الجن",         verses:  28, juz: 29, page: 574 },
  { id:  73, num:  73, name: "Al-Muzzammil",   arabicName: "المزمل",       nameAr: "المزمل",       verses:  20, juz: 29, page: 575 },
  { id:  74, num:  74, name: "Al-Muddaththir", arabicName: "المدثر",       nameAr: "المدثر",       verses:  56, juz: 29, page: 577 },
  { id:  75, num:  75, name: "Al-Qiyamah",     arabicName: "القيامة",      nameAr: "القيامة",      verses:  40, juz: 29, page: 580 },
  { id:  76, num:  76, name: "Al-Insan",       arabicName: "الإنسان",      nameAr: "الإنسان",      verses:  31, juz: 29, page: 581 },
  { id:  77, num:  77, name: "Al-Mursalat",    arabicName: "المرسلات",     nameAr: "المرسلات",     verses:  50, juz: 29, page: 583 },
  { id:  78, num:  78, name: "An-Naba",        arabicName: "النبأ",        nameAr: "النبأ",        verses:  40, juz: 30, page: 584 },
  { id:  79, num:  79, name: "An-Nazi'at",     arabicName: "النازعات",     nameAr: "النازعات",     verses:  46, juz: 30, page: 585 },
  { id:  80, num:  80, name: "'Abasa",         arabicName: "عبس",          nameAr: "عبس",          verses:  42, juz: 30, page: 585 },
  { id:  81, num:  81, name: "At-Takwir",      arabicName: "التكوير",      nameAr: "التكوير",      verses:  29, juz: 30, page: 586 },
  { id:  82, num:  82, name: "Al-Infitar",     arabicName: "الإنفطار",     nameAr: "الإنفطار",     verses:  19, juz: 30, page: 587 },
  { id:  83, num:  83, name: "Al-Mutaffifin",  arabicName: "المطففين",     nameAr: "المطففين",     verses:  36, juz: 30, page: 587 },
  { id:  84, num:  84, name: "Al-Inshiqaq",    arabicName: "الإنشقاق",     nameAr: "الإنشقاق",     verses:  25, juz: 30, page: 588 },
  { id:  85, num:  85, name: "Al-Buruj",       arabicName: "البروج",       nameAr: "البروج",       verses:  22, juz: 30, page: 590 },
  { id:  86, num:  86, name: "At-Tariq",       arabicName: "الطارق",       nameAr: "الطارق",       verses:  17, juz: 30, page: 591 },
  { id:  87, num:  87, name: "Al-A'la",        arabicName: "الأعلى",       nameAr: "الأعلى",       verses:  19, juz: 30, page: 591 },
  { id:  88, num:  88, name: "Al-Ghashiyah",   arabicName: "الغاشية",      nameAr: "الغاشية",      verses:  26, juz: 30, page: 592 },
  { id:  89, num:  89, name: "Al-Fajr",        arabicName: "الفجر",        nameAr: "الفجر",        verses:  30, juz: 30, page: 593 },
  { id:  90, num:  90, name: "Al-Balad",       arabicName: "البلد",        nameAr: "البلد",        verses:  20, juz: 30, page: 594 },
  { id:  91, num:  91, name: "Ash-Shams",      arabicName: "الشمس",        nameAr: "الشمس",        verses:  15, juz: 30, page: 595 },
  { id:  92, num:  92, name: "Al-Layl",        arabicName: "الليل",        nameAr: "الليل",        verses:  21, juz: 30, page: 595 },
  { id:  93, num:  93, name: "Ad-Duha",        arabicName: "الضحى",        nameAr: "الضحى",        verses:  11, juz: 30, page: 596 },
  { id:  94, num:  94, name: "Ash-Sharh",      arabicName: "الشرح",        nameAr: "الشرح",        verses:   8, juz: 30, page: 596 },
  { id:  95, num:  95, name: "At-Tin",         arabicName: "التين",        nameAr: "التين",        verses:   8, juz: 30, page: 597 },
  { id:  96, num:  96, name: "Al-Alaq",        arabicName: "العلق",        nameAr: "العلق",        verses:  19, juz: 30, page: 597 },
  { id:  97, num:  97, name: "Al-Qadr",        arabicName: "القدر",        nameAr: "القدر",        verses:   5, juz: 30, page: 598 },
  { id:  98, num:  98, name: "Al-Bayyinah",    arabicName: "البينة",       nameAr: "البينة",       verses:   8, juz: 30, page: 598 },
  { id:  99, num:  99, name: "Az-Zalzalah",    arabicName: "الزلزلة",      nameAr: "الزلزلة",      verses:   8, juz: 30, page: 599 },
  { id: 100, num: 100, name: "Al-Adiyat",      arabicName: "العاديات",     nameAr: "العاديات",     verses:  11, juz: 30, page: 599 },
  { id: 101, num: 101, name: "Al-Qari'ah",     arabicName: "القارعة",      nameAr: "القارعة",      verses:  11, juz: 30, page: 600 },
  { id: 102, num: 102, name: "At-Takathur",    arabicName: "التكاثر",      nameAr: "التكاثر",      verses:   8, juz: 30, page: 601 },
  { id: 103, num: 103, name: "Al-Asr",         arabicName: "العصر",        nameAr: "العصر",        verses:   3, juz: 30, page: 601 },
  { id: 104, num: 104, name: "Al-Humazah",     arabicName: "الهمزة",       nameAr: "الهمزة",       verses:   9, juz: 30, page: 601 },
  { id: 105, num: 105, name: "Al-Fil",         arabicName: "الفيل",        nameAr: "الفيل",        verses:   5, juz: 30, page: 601 },
  { id: 106, num: 106, name: "Quraysh",        arabicName: "قريش",         nameAr: "قريش",         verses:   4, juz: 30, page: 602 },
  { id: 107, num: 107, name: "Al-Ma'un",       arabicName: "الماعون",      nameAr: "الماعون",      verses:   7, juz: 30, page: 602 },
  { id: 108, num: 108, name: "Al-Kawthar",     arabicName: "الكوثر",       nameAr: "الكوثر",       verses:   3, juz: 30, page: 602 },
  { id: 109, num: 109, name: "Al-Kafirun",     arabicName: "الكافرون",     nameAr: "الكافرون",     verses:   6, juz: 30, page: 603 },
  { id: 110, num: 110, name: "An-Nasr",        arabicName: "النصر",        nameAr: "النصر",        verses:   3, juz: 30, page: 603 },
  { id: 111, num: 111, name: "Al-Masad",       arabicName: "المسد",        nameAr: "المسد",        verses:   5, juz: 30, page: 603 },
  { id: 112, num: 112, name: "Al-Ikhlas",      arabicName: "الإخلاص",      nameAr: "الإخلاص",      verses:   4, juz: 30, page: 604 },
  { id: 113, num: 113, name: "Al-Falaq",       arabicName: "الفلق",        nameAr: "الفلق",        verses:   5, juz: 30, page: 604 },
  { id: 114, num: 114, name: "An-Nas",         arabicName: "الناس",        nameAr: "الناس",        verses:   6, juz: 30, page: 604 },
];

// FIX 3: audioUrl — everyayah.com uses surah+ayah zero-padded to 3 digits each
// e.g. Surah 1 Ayah 3 → "001003.mp3"  (previously used wrong CDN formula)
export const audioUrl = (surahNum: number, ayahNum: number): string => {
  const s = String(surahNum).padStart(3, "0");
  const a = String(ayahNum).padStart(3, "0");
  return `https://everyayah.com/data/Alafasy_128kbps/${s}${a}.mp3`;
};

// Surah-level audio (full recitation) — used as fallback or for overview mode
export const surahAudioUrl = (surahNum: number): string =>
  `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${surahNum}.mp3`;

// surahList kept for backwards compatibility
export const surahList = SURAHS;