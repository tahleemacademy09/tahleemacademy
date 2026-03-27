// src/components/hifdh/surahData.ts
// Complete surah list — all fields used by every Hifdh component

export interface Surah {
  id: number;
  num: number;
  name: string;
  nameAr: string;
  arabicName: string; // alias
  verses: number;
  juz: number;
  page: number;
}

export interface Reciter {
  id: string;
  label: string;
  labelAr: string;
}

export const RECITERS: Reciter[] = [
  { id: "Alafasy_128kbps",                 label: "Mishary Alafasy",     labelAr: "مشاري العفاسي"   },
  { id: "AbdulSamad_128kbps",              label: "Abdul Basit (Murattal)",labelAr: "عبد الباسط"      },
  { id: "Husary_128kbps",                  label: "Mahmoud Al-Hussary",  labelAr: "محمود الحصري"    },
  { id: "Minshawy_Murattal_128kbps",       label: "Al-Minshawi",         labelAr: "المنشاوي"        },
  { id: "Abdurrahmaan_As-Sudais_192kbps",  label: "Sudais",              labelAr: "السديس"          },
  { id: "Abu_Bakr_Ash-Shaatree_128kbps",   label: "Abu Bakr Ash-Shatri", labelAr: "أبو بكر الشاطري" },
  { id: "Saad_Al-Ghamdi_128kbps",          label: "Saad Al-Ghamdi",      labelAr: "سعد الغامدي"    },
];

export const DEFAULT_RECITER = RECITERS[0].id;

// ── Audio URLs — everyayah.com CDN (per-ayah, reliable) ────────────
export const audioUrl = (surahNum: number, ayahNum: number, reciter = DEFAULT_RECITER): string => {
  const s = String(surahNum).padStart(3, "0");
  const a = String(ayahNum).padStart(3, "0");
  return `https://everyayah.com/data/${reciter}/${s}${a}.mp3`;
};

export const surahAudioUrl = (surahNum: number): string =>
  `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${surahNum}.mp3`;

// ── Complete 114-Surah array ────────────────────────────────────────
export const SURAHS: Surah[] = [
  { id:1,  num:1,  name:"Al-Fatihah",     nameAr:"الفاتحة",      arabicName:"الفاتحة",      verses:7,   juz:1,  page:1   },
  { id:2,  num:2,  name:"Al-Baqarah",     nameAr:"البقرة",       arabicName:"البقرة",       verses:286, juz:1,  page:2   },
  { id:3,  num:3,  name:"Aal-E-Imran",    nameAr:"آل عمران",     arabicName:"آل عمران",     verses:200, juz:3,  page:50  },
  { id:4,  num:4,  name:"An-Nisa",        nameAr:"النساء",       arabicName:"النساء",       verses:176, juz:4,  page:77  },
  { id:5,  num:5,  name:"Al-Ma'idah",     nameAr:"المائدة",      arabicName:"المائدة",      verses:120, juz:6,  page:106 },
  { id:6,  num:6,  name:"Al-An'am",       nameAr:"الأنعام",      arabicName:"الأنعام",      verses:165, juz:7,  page:128 },
  { id:7,  num:7,  name:"Al-A'raf",       nameAr:"الأعراف",      arabicName:"الأعراف",      verses:206, juz:8,  page:151 },
  { id:8,  num:8,  name:"Al-Anfal",       nameAr:"الأنفال",      arabicName:"الأنفال",      verses:75,  juz:9,  page:177 },
  { id:9,  num:9,  name:"At-Tawbah",      nameAr:"التوبة",       arabicName:"التوبة",       verses:129, juz:10, page:187 },
  { id:10, num:10, name:"Yunus",          nameAr:"يونس",         arabicName:"يونس",         verses:109, juz:11, page:208 },
  { id:11, num:11, name:"Hud",            nameAr:"هود",          arabicName:"هود",          verses:123, juz:11, page:221 },
  { id:12, num:12, name:"Yusuf",          nameAr:"يوسف",         arabicName:"يوسف",         verses:111, juz:12, page:235 },
  { id:13, num:13, name:"Ar-Ra'd",        nameAr:"الرعد",        arabicName:"الرعد",        verses:43,  juz:13, page:249 },
  { id:14, num:14, name:"Ibrahim",        nameAr:"إبراهيم",      arabicName:"إبراهيم",      verses:52,  juz:13, page:255 },
  { id:15, num:15, name:"Al-Hijr",        nameAr:"الحجر",        arabicName:"الحجر",        verses:99,  juz:14, page:262 },
  { id:16, num:16, name:"An-Nahl",        nameAr:"النحل",        arabicName:"النحل",        verses:128, juz:14, page:267 },
  { id:17, num:17, name:"Al-Isra",        nameAr:"الإسراء",      arabicName:"الإسراء",      verses:111, juz:15, page:282 },
  { id:18, num:18, name:"Al-Kahf",        nameAr:"الكهف",        arabicName:"الكهف",        verses:110, juz:15, page:293 },
  { id:19, num:19, name:"Maryam",         nameAr:"مريم",         arabicName:"مريم",         verses:98,  juz:16, page:305 },
  { id:20, num:20, name:"Ta-Ha",          nameAr:"طه",           arabicName:"طه",           verses:135, juz:16, page:312 },
  { id:21, num:21, name:"Al-Anbiya",      nameAr:"الأنبياء",     arabicName:"الأنبياء",     verses:112, juz:17, page:322 },
  { id:22, num:22, name:"Al-Hajj",        nameAr:"الحج",         arabicName:"الحج",         verses:78,  juz:17, page:332 },
  { id:23, num:23, name:"Al-Mu'minun",    nameAr:"المؤمنون",     arabicName:"المؤمنون",     verses:118, juz:18, page:342 },
  { id:24, num:24, name:"An-Nur",         nameAr:"النور",        arabicName:"النور",        verses:64,  juz:18, page:350 },
  { id:25, num:25, name:"Al-Furqan",      nameAr:"الفرقان",      arabicName:"الفرقان",      verses:77,  juz:18, page:359 },
  { id:26, num:26, name:"Ash-Shu'ara",    nameAr:"الشعراء",      arabicName:"الشعراء",      verses:227, juz:19, page:367 },
  { id:27, num:27, name:"An-Naml",        nameAr:"النمل",        arabicName:"النمل",        verses:93,  juz:19, page:377 },
  { id:28, num:28, name:"Al-Qasas",       nameAr:"القصص",        arabicName:"القصص",        verses:88,  juz:20, page:385 },
  { id:29, num:29, name:"Al-Ankabut",     nameAr:"العنكبوت",     arabicName:"العنكبوت",     verses:69,  juz:20, page:396 },
  { id:30, num:30, name:"Ar-Rum",         nameAr:"الروم",        arabicName:"الروم",        verses:60,  juz:21, page:404 },
  { id:31, num:31, name:"Luqman",         nameAr:"لقمان",        arabicName:"لقمان",        verses:34,  juz:21, page:411 },
  { id:32, num:32, name:"As-Sajdah",      nameAr:"السجدة",       arabicName:"السجدة",       verses:30,  juz:21, page:415 },
  { id:33, num:33, name:"Al-Ahzab",       nameAr:"الأحزاب",      arabicName:"الأحزاب",      verses:73,  juz:21, page:418 },
  { id:34, num:34, name:"Saba",           nameAr:"سبأ",          arabicName:"سبأ",          verses:54,  juz:22, page:428 },
  { id:35, num:35, name:"Fatir",          nameAr:"فاطر",         arabicName:"فاطر",         verses:45,  juz:22, page:434 },
  { id:36, num:36, name:"Ya-Sin",         nameAr:"يس",           arabicName:"يس",           verses:83,  juz:22, page:440 },
  { id:37, num:37, name:"As-Saffat",      nameAr:"الصافات",      arabicName:"الصافات",      verses:182, juz:23, page:446 },
  { id:38, num:38, name:"Sad",            nameAr:"ص",            arabicName:"ص",            verses:88,  juz:23, page:453 },
  { id:39, num:39, name:"Az-Zumar",       nameAr:"الزمر",        arabicName:"الزمر",        verses:75,  juz:23, page:458 },
  { id:40, num:40, name:"Ghafir",         nameAr:"غافر",         arabicName:"غافر",         verses:85,  juz:24, page:467 },
  { id:41, num:41, name:"Fussilat",       nameAr:"فصلت",         arabicName:"فصلت",         verses:54,  juz:24, page:477 },
  { id:42, num:42, name:"Ash-Shura",      nameAr:"الشورى",       arabicName:"الشورى",       verses:53,  juz:25, page:483 },
  { id:43, num:43, name:"Az-Zukhruf",     nameAr:"الزخرف",       arabicName:"الزخرف",       verses:89,  juz:25, page:489 },
  { id:44, num:44, name:"Ad-Dukhan",      nameAr:"الدخان",       arabicName:"الدخان",       verses:59,  juz:25, page:496 },
  { id:45, num:45, name:"Al-Jathiyah",    nameAr:"الجاثية",      arabicName:"الجاثية",      verses:37,  juz:25, page:499 },
  { id:46, num:46, name:"Al-Ahqaf",       nameAr:"الأحقاف",      arabicName:"الأحقاف",      verses:35,  juz:26, page:502 },
  { id:47, num:47, name:"Muhammad",       nameAr:"محمد",         arabicName:"محمد",         verses:38,  juz:26, page:507 },
  { id:48, num:48, name:"Al-Fath",        nameAr:"الفتح",        arabicName:"الفتح",        verses:29,  juz:26, page:511 },
  { id:49, num:49, name:"Al-Hujurat",     nameAr:"الحجرات",      arabicName:"الحجرات",      verses:18,  juz:26, page:515 },
  { id:50, num:50, name:"Qaf",            nameAr:"ق",            arabicName:"ق",            verses:45,  juz:26, page:518 },
  { id:51, num:51, name:"Adh-Dhariyat",   nameAr:"الذاريات",     arabicName:"الذاريات",     verses:60,  juz:26, page:520 },
  { id:52, num:52, name:"At-Tur",         nameAr:"الطور",        arabicName:"الطور",        verses:49,  juz:27, page:523 },
  { id:53, num:53, name:"An-Najm",        nameAr:"النجم",        arabicName:"النجم",        verses:62,  juz:27, page:526 },
  { id:54, num:54, name:"Al-Qamar",       nameAr:"القمر",        arabicName:"القمر",        verses:55,  juz:27, page:528 },
  { id:55, num:55, name:"Ar-Rahman",      nameAr:"الرحمن",       arabicName:"الرحمن",       verses:78,  juz:27, page:531 },
  { id:56, num:56, name:"Al-Waqi'ah",     nameAr:"الواقعة",      arabicName:"الواقعة",      verses:96,  juz:27, page:534 },
  { id:57, num:57, name:"Al-Hadid",       nameAr:"الحديد",       arabicName:"الحديد",       verses:29,  juz:27, page:537 },
  { id:58, num:58, name:"Al-Mujadila",    nameAr:"المجادلة",     arabicName:"المجادلة",     verses:22,  juz:28, page:542 },
  { id:59, num:59, name:"Al-Hashr",       nameAr:"الحشر",        arabicName:"الحشر",        verses:24,  juz:28, page:545 },
  { id:60, num:60, name:"Al-Mumtahanah",  nameAr:"الممتحنة",     arabicName:"الممتحنة",     verses:13,  juz:28, page:549 },
  { id:61, num:61, name:"As-Saff",        nameAr:"الصف",         arabicName:"الصف",         verses:14,  juz:28, page:551 },
  { id:62, num:62, name:"Al-Jumu'ah",     nameAr:"الجمعة",       arabicName:"الجمعة",       verses:11,  juz:28, page:553 },
  { id:63, num:63, name:"Al-Munafiqun",   nameAr:"المنافقون",    arabicName:"المنافقون",    verses:11,  juz:28, page:554 },
  { id:64, num:64, name:"At-Taghabun",    nameAr:"التغابن",      arabicName:"التغابن",      verses:18,  juz:28, page:556 },
  { id:65, num:65, name:"At-Talaq",       nameAr:"الطلاق",       arabicName:"الطلاق",       verses:12,  juz:28, page:558 },
  { id:66, num:66, name:"At-Tahrim",      nameAr:"التحريم",      arabicName:"التحريم",      verses:12,  juz:28, page:560 },
  { id:67, num:67, name:"Al-Mulk",        nameAr:"الملك",        arabicName:"الملك",        verses:30,  juz:29, page:562 },
  { id:68, num:68, name:"Al-Qalam",       nameAr:"القلم",        arabicName:"القلم",        verses:52,  juz:29, page:564 },
  { id:69, num:69, name:"Al-Haqqah",      nameAr:"الحاقة",       arabicName:"الحاقة",       verses:52,  juz:29, page:566 },
  { id:70, num:70, name:"Al-Ma'arij",     nameAr:"المعارج",      arabicName:"المعارج",      verses:44,  juz:29, page:568 },
  { id:71, num:71, name:"Nuh",            nameAr:"نوح",          arabicName:"نوح",          verses:28,  juz:29, page:570 },
  { id:72, num:72, name:"Al-Jinn",        nameAr:"الجن",         arabicName:"الجن",         verses:28,  juz:29, page:572 },
  { id:73, num:73, name:"Al-Muzzammil",   nameAr:"المزمل",       arabicName:"المزمل",       verses:20,  juz:29, page:574 },
  { id:74, num:74, name:"Al-Muddaththir", nameAr:"المدثر",       arabicName:"المدثر",       verses:56,  juz:29, page:575 },
  { id:75, num:75, name:"Al-Qiyamah",     nameAr:"القيامة",      arabicName:"القيامة",      verses:40,  juz:29, page:577 },
  { id:76, num:76, name:"Al-Insan",       nameAr:"الإنسان",      arabicName:"الإنسان",      verses:31,  juz:29, page:578 },
  { id:77, num:77, name:"Al-Mursalat",    nameAr:"المرسلات",     arabicName:"المرسلات",     verses:50,  juz:29, page:580 },
  { id:78, num:78, name:"An-Naba",        nameAr:"النبأ",        arabicName:"النبأ",        verses:40,  juz:30, page:582 },
  { id:79, num:79, name:"An-Nazi'at",     nameAr:"النازعات",     arabicName:"النازعات",     verses:46,  juz:30, page:583 },
  { id:80, num:80, name:"'Abasa",         nameAr:"عبس",          arabicName:"عبس",          verses:42,  juz:30, page:585 },
  { id:81, num:81, name:"At-Takwir",      nameAr:"التكوير",      arabicName:"التكوير",      verses:29,  juz:30, page:586 },
  { id:82, num:82, name:"Al-Infitar",     nameAr:"الإنفطار",     arabicName:"الإنفطار",     verses:19,  juz:30, page:587 },
  { id:83, num:83, name:"Al-Mutaffifin",  nameAr:"المطففين",     arabicName:"المطففين",     verses:36,  juz:30, page:587 },
  { id:84, num:84, name:"Al-Inshiqaq",    nameAr:"الإنشقاق",     arabicName:"الإنشقاق",     verses:25,  juz:30, page:589 },
  { id:85, num:85, name:"Al-Buruj",       nameAr:"البروج",       arabicName:"البروج",       verses:22,  juz:30, page:590 },
  { id:86, num:86, name:"At-Tariq",       nameAr:"الطارق",       arabicName:"الطارق",       verses:17,  juz:30, page:591 },
  { id:87, num:87, name:"Al-A'la",        nameAr:"الأعلى",       arabicName:"الأعلى",       verses:19,  juz:30, page:591 },
  { id:88, num:88, name:"Al-Ghashiyah",   nameAr:"الغاشية",      arabicName:"الغاشية",      verses:26,  juz:30, page:592 },
  { id:89, num:89, name:"Al-Fajr",        nameAr:"الفجر",        arabicName:"الفجر",        verses:30,  juz:30, page:593 },
  { id:90, num:90, name:"Al-Balad",       nameAr:"البلد",        arabicName:"البلد",        verses:20,  juz:30, page:594 },
  { id:91, num:91, name:"Ash-Shams",      nameAr:"الشمس",        arabicName:"الشمس",        verses:15,  juz:30, page:595 },
  { id:92, num:92, name:"Al-Layl",        nameAr:"الليل",        arabicName:"الليل",        verses:21,  juz:30, page:595 },
  { id:93, num:93, name:"Ad-Duha",        nameAr:"الضحى",        arabicName:"الضحى",        verses:11,  juz:30, page:596 },
  { id:94, num:94, name:"Ash-Sharh",      nameAr:"الشرح",        arabicName:"الشرح",        verses:8,   juz:30, page:596 },
  { id:95, num:95, name:"At-Tin",         nameAr:"التين",        arabicName:"التين",        verses:8,   juz:30, page:597 },
  { id:96, num:96, name:"Al-Alaq",        nameAr:"العلق",        arabicName:"العلق",        verses:19,  juz:30, page:597 },
  { id:97, num:97, name:"Al-Qadr",        nameAr:"القدر",        arabicName:"القدر",        verses:5,   juz:30, page:598 },
  { id:98, num:98, name:"Al-Bayyinah",    nameAr:"البينة",       arabicName:"البينة",       verses:8,   juz:30, page:598 },
  { id:99, num:99, name:"Az-Zalzalah",    nameAr:"الزلزلة",      arabicName:"الزلزلة",      verses:8,   juz:30, page:599 },
  { id:100,num:100,name:"Al-Adiyat",      nameAr:"العاديات",     arabicName:"العاديات",     verses:11,  juz:30, page:599 },
  { id:101,num:101,name:"Al-Qari'ah",     nameAr:"القارعة",      arabicName:"القارعة",      verses:11,  juz:30, page:600 },
  { id:102,num:102,name:"At-Takathur",    nameAr:"التكاثر",      arabicName:"التكاثر",      verses:8,   juz:30, page:600 },
  { id:103,num:103,name:"Al-Asr",         nameAr:"العصر",        arabicName:"العصر",        verses:3,   juz:30, page:601 },
  { id:104,num:104,name:"Al-Humazah",     nameAr:"الهمزة",       arabicName:"الهمزة",       verses:9,   juz:30, page:601 },
  { id:105,num:105,name:"Al-Fil",         nameAr:"الفيل",        arabicName:"الفيل",        verses:5,   juz:30, page:601 },
  { id:106,num:106,name:"Quraysh",        nameAr:"قريش",         arabicName:"قريش",         verses:4,   juz:30, page:602 },
  { id:107,num:107,name:"Al-Ma'un",       nameAr:"الماعون",      arabicName:"الماعون",      verses:7,   juz:30, page:602 },
  { id:108,num:108,name:"Al-Kawthar",     nameAr:"الكوثر",       arabicName:"الكوثر",       verses:3,   juz:30, page:602 },
  { id:109,num:109,name:"Al-Kafirun",     nameAr:"الكافرون",     arabicName:"الكافرون",     verses:6,   juz:30, page:603 },
  { id:110,num:110,name:"An-Nasr",        nameAr:"النصر",        arabicName:"النصر",        verses:3,   juz:30, page:603 },
  { id:111,num:111,name:"Al-Masad",       nameAr:"المسد",        arabicName:"المسد",        verses:5,   juz:30, page:603 },
  { id:112,num:112,name:"Al-Ikhlas",      nameAr:"الإخلاص",      arabicName:"الإخلاص",      verses:4,   juz:30, page:604 },
  { id:113,num:113,name:"Al-Falaq",       nameAr:"الفلق",        arabicName:"الفلق",        verses:5,   juz:30, page:604 },
  { id:114,num:114,name:"An-Nas",         nameAr:"الناس",        arabicName:"الناس",        verses:6,   juz:30, page:604 },
];

// Keep legacy alias
export const surahList = SURAHS;
