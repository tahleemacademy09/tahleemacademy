/*  src/components/dashboard/IslamicDailyFeed.data.ts
    Islamic Daily Feed — All data constants, types, and pure helpers
    Split from IslamicDailyFeed.tsx to keep each file pasteable on GitHub.
*/

// ── Colour tokens ─────────────────────────────────────────────────────────
export const DARK_GREEN = "#0f2d1f";
export const MID_GREEN  = "#1a4731";
export const GOLD       = "#c9a84c";
export const GOLD_LIGHT = "#e4c36a";
export const TEXT_DARK  = "#0f2d1f";
export const TEXT_MED   = "#4a7c59";
export const TEXT_LIGHT = "#7a9e88";
export const BORDER     = "rgba(15,45,31,0.1)";
export const AMBER      = "#92400e";
export const AMBER_BG   = "#fffbeb";

// ── Pure helpers ──────────────────────────────────────────────────────────
export const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

export const getHijriNumeric = (date: Date): { day: number; month: number } => {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric",
    }).formatToParts(date);
    return {
      day:   parseInt(parts.find(p => p.type === "day")?.value   ?? "0"),
      month: parseInt(parts.find(p => p.type === "month")?.value ?? "0"),
    };
  } catch { return { day: 0, month: 0 }; }
};

// ── Types ─────────────────────────────────────────────────────────────────
export interface LiveHadith {
  ar?: string;
  en: string;
  source: string;
  narrator: string;
  grade: string;
  explanation: string;
}
export interface NewsItem {
  title: string;
  link: string;
  description: string;
  thumbnail: string;
  pubDate: string;
}
export type TabId = "hadith" | "seerah" | "event" | "news" | "tawheed";

export interface TawheedLesson {
  module: string;
  moduleBg: string; moduleBadge: string; moduleBorder: string;
  titleEn: string; titleAr: string; subtitleEn: string;
  quranicProof: { ar: string; en: string; ref: string };
  hadith: { ar: string; en: string; source: string };
  explanation: string;
}

export const FALLBACK_HADITHS = [
  { ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى", en: "Actions are only by intentions, and every person will have only what they intended.", source: "Sahih al-Bukhari 1", narrator: "Umar ibn al-Khattab رضي الله عنه", grade: "Sahih", explanation: "This is one of the foundational hadiths of Islam. Imam al-Nawawi considered it one of the hadiths upon which Islamic jurisprudence revolves. It means that the validity and reward of every deed depends entirely on the intention behind it. A person who fasts with sincerity for Allah receives full reward, while one who fasts to be seen by people receives nothing. The Prophet ﷺ himself said: 'Verily Allah does not look at your bodies or your appearances, but He looks at your hearts and your deeds.' (Muslim 2564)" },
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", source: "Sahih al-Bukhari 5027", narrator: "Uthman ibn Affan رضي الله عنه", grade: "Sahih", explanation: "This hadith elevates those who dedicate themselves to the Quran — both learning it and passing it on. Allah says: 'Indeed, it is We who sent down the Quran and indeed, We will be its guardian.' (15:9). The scholars explain that 'learning' includes memorisation, understanding tafseer and tajweed, while 'teaching' encompasses all forms of transmission — formal classes, corrections, or simply reciting to one's child. Imam al-Bukhari placed this hadith in Kitab Fadha'il al-Quran. The Prophet ﷺ also said: 'The one who recites the Quran skillfully will be with the noble, dutiful angels, and the one who recites with difficulty will have a double reward.' (Muslim 798)" },
  { ar: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ", en: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Sahih al-Bukhari 13", narrator: "Anas ibn Malik رضي الله عنه", grade: "Sahih", explanation: "This hadith defines a cornerstone of Islamic brotherhood. The word 'brother' here includes all Muslims — men and women. Ibn Rajab al-Hanbali explains that this love should extend beyond Muslims to all of humanity in terms of wishing guidance and goodness for them. The Quran says: 'The believers are but brothers.' (49:10). This principle prevents jealousy, schadenfreude, and competitive meanness. The Prophet ﷺ also said: 'Do not envy one another, do not inflate prices against one another, do not hate one another, do not turn away from one another... be servants of Allah and brothers.' (Muslim 2564)" },
  { ar: "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ", en: "Whoever believes in Allah and the Last Day should speak good or remain silent.", source: "Sahih al-Bukhari 6018", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih", explanation: "Imam al-Nawawi called this one of the most comprehensive hadiths, saying it is sufficient for the disciplining of the tongue. Allah says: 'Not a word does he utter but there is a watcher by him ready to record it.' (50:18). The Prophet ﷺ also warned: 'A man might say a word pleasing to Allah without considering it significant, yet Allah will raise him many degrees. A man might say a word displeasing to Allah without considering it significant, yet it will cast him into Hellfire.' (Bukhari 6478). Silence is ibadah when speech would bring sin." },
  { ar: "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ", en: "The most beloved deeds to Allah are those done consistently, even if they are few.", source: "Sahih al-Bukhari 6465", narrator: "Aishah رضي الله عنها", grade: "Sahih", explanation: "This hadith establishes the Islamic principle of consistency over quantity. The Prophet ﷺ himself had consistent daily practices (rawatib, morning/evening adhkar, night prayer) that he never abandoned even while travelling. Aishah (RA) said: 'His deeds were continuous.' (Muslim 746). Ibn Hajar explains that consistent deeds, even if small, keep the heart connected to Allah, while bursts of intense worship followed by complete abandonment do not. Allah says: 'So worship Him and be steadfast in His worship.' (19:65). Start small — one page of Quran daily is better than ten pages once a week." },
  { ar: "إِنَّ اللَّهَ لاَ يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ", en: "Allah does not look at your forms and wealth, but He looks at your hearts and deeds.", source: "Sahih Muslim 2564", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih", explanation: "This hadith is a tremendous equaliser. Wealth, beauty, social status, and race are irrelevant to Allah. What matters is taqwa and sincerity. The Quran confirms: 'Indeed, the most noble of you in the sight of Allah is the most righteous.' (49:13). The Prophet ﷺ demonstrated this by elevating Bilal (a freed slave), Salman al-Farisi (a Persian), and Suhayb al-Rumi (a Roman) to positions of honour. Ibn al-Qayyim wrote extensively that the condition of the heart directly shapes the quality of deeds — a sound heart produces sound actions, and a corrupt heart corrupts even outwardly good deeds." },
  { ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ", en: "Seeking knowledge is an obligation upon every Muslim.", source: "Ibn Majah 224", narrator: "Anas ibn Malik رضي الله عنه", grade: "Sahih (authenticated by al-Albani)", explanation: "The obligation applies to the religious knowledge every Muslim needs for their own practice (fard 'ayn) — knowing how to pray, fast, deal honestly, etc. Beyond that, collective knowledge obligations (fard kifayah) include scholarship, medicine, and other disciplines the Ummah needs. The Quran begins with 'Iqra' (Read!) and contains the word 'ilm (knowledge) and its derivatives over 750 times. Allah says: 'Are those who know equal to those who do not know?' (39:9). The Prophet ﷺ also said: 'Whoever travels a path seeking knowledge, Allah will ease for him a path to Paradise.' (Muslim 2699). Knowledge is the foundation upon which all worship is built correctly." },
  { ar: "حُفَّتِ الْجَنَّةُ بِالْمَكَارِهِ وَحُفَّتِ النَّارُ بِالشَّهَوَاتِ", en: "Paradise is surrounded by hardships, and Hellfire is surrounded by desires.", source: "Sahih Muslim 2822", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih", explanation: "Ibn al-Qayyim commented extensively on this hadith in his masterpiece Madarij al-Salikin. The meaning is that the path to Paradise requires pushing through discomfort — waking for Fajr, controlling desires, being patient in adversity, spending in charity. The path to Hellfire, by contrast, is lined with pleasures that feel easy and natural to the nafs. Allah says: 'Indeed, man was created anxious — when evil touches him, impatient, and when good touches him, withholding.' (70:19-21). The antidote is salah: 'Except the performers of prayer.' (70:22). Every act of worship is a small battle against the nafs — and each victory draws you closer to Paradise." },
  { ar: "كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ", en: "Be in this world as though you were a stranger or a wayfarer.", source: "Sahih al-Bukhari 6416", narrator: "Ibn Umar رضي الله عنه", grade: "Sahih", explanation: "This hadith is the foundation of the Islamic philosophy of zuhd (detachment from the dunya). Ibn Umar (RA) would add: 'When evening comes, do not expect to live until morning. When morning comes, do not expect to live until evening. Take from your health for your illness, and from your life for your death.' Allah says: 'Know that the life of this world is only play and amusement, pomp and mutual boasting among you.' (57:20). A traveller packs only what they need for the journey — they don't build mansions at rest stops. The Prophet ﷺ himself left this world owning almost nothing. True wealth, the Quran tells us, is wealth of the heart (taqwa)." },
  { ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: صَدَقَةٍ جَارِيَةٍ، أَوْ عِلْمٍ يُنْتَفَعُ بِهِ، أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ", en: "When a person dies, all their deeds come to an end except three: ongoing charity, knowledge that benefits, or a righteous child who prays for them.", source: "Sahih Muslim 1631", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih", explanation: "This hadith reveals the three investments whose returns extend beyond the grave. Sadaqah jariyah (ongoing charity) includes building a masjid, digging a well, planting a tree under whose shade others rest, or funding an orphan's education. Knowledge that benefits includes a book written, a student taught, or a Quran class established. A righteous child who prays for their parents is the most personal of these gifts. The scholars note that this doesn't mean other deeds stop earning reward — rather, the deeds of the living that were initiated or caused by the deceased continue to carry reward back to them. Plant seeds whose fruits others will harvest — and you will share in every fruit." },
  { ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever travels a path seeking knowledge, Allah will make easy for him a path to Paradise.", source: "Sahih Muslim 2699", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih", explanation: "The word 'path' (tareeq) is understood both literally and metaphorically — physical travel to a scholar and the mental journey of studying. The angels lower their wings for the seeker of knowledge in approval. Allah says: 'Allah will raise the rank of those who believe and those given knowledge.' (58:11). Ibn Abd al-Barr compiled an entire book (Jami' Bayan al-Ilm) on the virtues of knowledge. The early Muslims would travel for months to verify a single hadith. Imam al-Bukhari made 16 journeys across the Islamic world for his collection. For us: reading, attending classes, listening to scholars — all of this is this path." },
];

// ── Rich Seerah Entries with Quranic & Hadith Evidence ──────────────────
export const SEERAH = [
  {
    title: "The Year of the Elephant — Divine Protection 🐘",
    titleAr: "عام الفيل",
    year: "570 CE | Before Prophethood",
    content: `In the year the Prophet ﷺ was born, a remarkable event established the divine sanctity of the Kaabah before the world. Abraha ibn al-Sabbah, the Christian viceroy of Yemen under Abyssinian rule, built an enormous church in Sana'a called al-Qullays and ordered Arabs to perform pilgrimage there instead of Makkah. When this failed, he mobilised a massive army — including war elephants — to destroy the Kaabah itself.

As Abraha's army approached Makkah, Abd al-Muttalib (the Prophet's grandfather) calmly said: "As for this House [the Kaabah], it has its own Lord Who will protect it." He took his family and the Makkans to the hills. What followed was among the most miraculous events in pre-Islamic Arabia.

QURANIC EVIDENCE:
Allah preserved the memory of this event in the Quran: "Have you not seen what your Lord did to the companions of the elephant? Did He not make their plan go astray? And He sent against them birds in flocks, striking them with stones of hard clay — and He made them like eaten straw." (Surah Al-Fil 105:1-5)

The Ababeel birds dropped sijjeel stones (baked clay or hardened lava) upon the army, causing a devastating plague-like destruction. The entire army collapsed. Abraha himself died on the retreat — his body reportedly deteriorating piece by piece.

HISTORICAL SIGNIFICANCE:
The Quraysh used this event as proof of their special status as guardians of the Kaabah. Allah honoured them with "the security of this House" (Surah Quraysh 106:3-4). It was also in this same year — approximately April or May — that Muhammad ﷺ was born. The timing was not coincidental. The earth was being prepared for its greatest inhabitant. As Ibn Kathir wrote: "Allah honoured the Kaabah by protecting it, just as He was about to honour the earth with His final Messenger."

LESSON:
When Allah wills to protect something, no army of any size can prevail against it. The same divine protection surrounds the Quran: "Indeed, it is We who sent down the Reminder, and indeed We will be its guardian." (Quran 15:9).`,
  },
  {
    title: "Birth of the Prophet ﷺ — Light Upon the World",
    titleAr: "مولد النبي ﷺ",
    year: "570 CE | 12 Rabi al-Awwal",
    content: `Muhammad ibn Abdullah ibn Abd al-Muttalib ﷺ was born on a Monday in Makkah, in the neighbourhood of Banu Hashim, in the Year of the Elephant. His father Abdullah had passed away before his birth, leaving him an orphan from his first breath — a fact the Quran later addressed as a divine arrangement: "Did He not find you an orphan and give you shelter?" (93:6).

WHAT THE PROPHET ﷺ SAID ABOUT HIS BIRTH:
When asked why he fasted on Mondays, the Prophet ﷺ replied: "That is the day I was born and the day revelation came to me." (Sahih Muslim 1162). He was born circumcised according to some narrations, and his mother Aminah reported that at his birth she saw a light that illuminated the palaces of Syria. This light is referenced in the hadith: "I was the last of the prophets with Allah, while Adam was still clay." (Ahmad — Sahih).

HIS LINEAGE:
The Prophet ﷺ himself said: "Allah chose Kinanah from the sons of Ismail, and He chose Quraysh from Kinanah, and He chose Banu Hashim from Quraysh, and He chose me from Banu Hashim." (Muslim 2276). His lineage traces back to Ibrahim (AS) through his son Ismail (AS) — making him the fulfilment of Ibrahim's famous supplication: "Our Lord, send among them a messenger from themselves who will recite to them Your verses and teach them the Book and wisdom." (Quran 2:129).

THE GLAD TIDINGS BEFORE HIM:
Both the Torah and Injeel contained prophecies about his coming. Allah says: "Those who follow the messenger, the unlettered prophet, whom they find written in what they have of the Torah and the Gospel." (Quran 7:157). And in Surah as-Saf, Allah quotes Isa (AS): "And [mention] when Jesus, the son of Mary, said: 'O children of Israel, indeed I am the messenger of Allah to you... and bringing glad tidings of a messenger to come after me whose name is Ahmad.'" (61:6).

THE NAME MUHAMMAD:
The name Muhammad — meaning "the one who is excessively praised" — was rare among Arabs at the time. His grandfather Abd al-Muttalib chose it, saying he hoped his grandson would be praised in the heavens and on earth. Indeed, he ﷺ is praised by Allah Himself: "Indeed, Allah and His angels send blessings upon the Prophet. O you who have believed, ask [Allah to confer] blessing upon him and ask [Allah to grant him] peace." (Quran 33:56).`,
  },
  {
    title: "The Chest Opening — Purification of the Chosen ✨",
    titleAr: "شق الصدر",
    year: "~574 CE | Childhood",
    content: `While the young Muhammad ﷺ was living with his foster family in the Banu Sa'd tribe, one of the most profound spiritual events in human history occurred in the hills of the Arabian desert. Two angels appeared in the form of men wearing white garments, and they opened the chest of the Prophet ﷺ — an event that occurred not once but twice in his lifetime.

THE FIRST OPENING:
Anas ibn Malik (RA) reported: "Jibreel came to the Messenger of Allah ﷺ while he was playing with the other boys. He took hold of him and threw him down, then he opened his chest and took out his heart. Then he took out a black clot from it and said: 'This is the portion of Shaytan from you.' Then he washed it in a golden vessel with Zamzam water, put it back together, and returned it to its place." (Sahih Muslim 162).

THE SECOND OPENING — ON THE NIGHT OF MIRAJ:
Ibn Hajar records in Fath al-Bari that the chest was opened again on the night of al-Isra wal-Miraj before the Prophet ﷺ ascended through the heavens, as a further spiritual preparation for meeting Allah.

QURANIC REFERENCE:
Allah refers to this spiritual expansion in Surah ash-Sharh: "Did We not expand for you your chest? And We removed from you your burden which had weighed upon your back. And raised high for you your repute." (94:1-4). While the scholars differ on whether this refers to the physical chest-opening or a metaphorical spiritual expansion — or both — there is consensus that Allah specially prepared the Prophet's ﷺ heart for prophethood in ways beyond ordinary human experience.

WHAT DOES "CLOT OF SHAYTAN" MEAN?
The scholars explain this is not suggesting the Prophet ﷺ was sinful — prophets are protected (ma'sum) from major sins. Rather, it refers to the natural inclination toward the dunya and desires that exists in all humans. Allah removed even this subtle trace from the Prophet ﷺ to make his heart a perfect vessel for divine revelation. Ibn al-Qayyim wrote: "The heart of the Prophet ﷺ was the most perfect of vessels — transparent, pure, a mirror for divine light."

LESSON:
Every human carries impurities in the heart — the Prophet ﷺ had his miraculously cleansed; we are expected to do ours through tawbah, dhikr, and following his Sunnah. "Verily, in the remembrance of Allah do hearts find rest." (Quran 13:28).`,
  },
  {
    title: "Al-Amin — A Character Before Prophethood 🌟",
    titleAr: "الأمين — أمانة قبل النبوة",
    year: "Before 610 CE | Youth to Age 40",
    content: `Before a single verse was revealed, before any claim to prophethood, before Islam was even named — the people of Makkah called Muhammad ﷺ by a title: AL-AMIN (the Trustworthy). This was not a formal designation — it was the organic, unanimous recognition of an entire society. Both friends and enemies, the poor and the wealthy, the noble and the enslaved — all agreed that Muhammad ibn Abdullah was a man of absolute integrity.

HADITH EVIDENCE:
When the Prophet ﷺ stood on Mount Safa in 613 CE to first publicly preach Islam, he called out: "O people of Quraysh! If I were to tell you that behind this hill there is an army coming to attack you — would you believe me?" Every person in the crowd replied: "Yes — for we have never known you to lie." (Bukhari 4770). This was remarkable: he was speaking to people who would later become his fiercest enemies — yet not even they could deny his truthfulness.

JABIR IBN ABDILLAH (RA) NARRATED:
"The Messenger of Allah ﷺ never said 'no' to anyone who asked him for something." (Bukhari 6034). His generosity was an extension of his truthfulness — he meant what he said and gave what he promised.

KHADIJAH'S TESTIMONY:
When he returned from the cave trembling, it was his character — not miracles — that Khadijah (RA) first cited: "By Allah, Allah will never disgrace you. You maintain family ties, you speak truthfully, you carry the burdens of the weak, you help the poor, you honour your guests, and you assist those who suffer calamities." (Bukhari 3). She knew his character so deeply that she could predict divine favour with certainty.

QURANIC AFFIRMATION:
Allah Himself certified his character: "And indeed, you are of a great moral character." (Quran 68:4). This verse was revealed early in the Makkan period — and it was affirming something the people already knew. Aishah (RA) summarised it perfectly: when asked about his character, she said: "His character was the Quran." (Muslim 746).

THE LESSON FOR US:
The Prophet ﷺ built his credibility over 40 years before making his greatest claim — prophethood. Integrity is not built in a moment; it is the accumulation of ten thousand small choices to tell the truth, keep a promise, and treat others fairly. In a world of instant credentials, Islam teaches that character is built slowly and tested constantly.`,
  },
  {
    title: "Khadijah رضي الله عنها — The First Believer 💛",
    titleAr: "أم المؤمنين السيدة خديجة رضي الله عنها",
    year: "595 CE | Marriage | 610 CE | First Revelation",
    content: `Khadijah bint Khuwaylid (RA) was, in the words of the Prophet ﷺ himself, "the best of the women of her time." She was a wealthy, independent businesswoman of Makkah — twice widowed, deeply respected, known for her intelligence and moral standing. When she hired the young Muhammad ﷺ to lead her trade caravan to Syria, she was immediately struck by his character, his integrity, and his results. Her servant Maysarah reported back the extraordinary signs he had witnessed on the journey.

THE MARRIAGE:
Khadijah sent word through her friend Nafisah proposing marriage. The Prophet ﷺ was 25; she was 40. Every measure of worldly convention was reversed — she was older, wealthier, and she proposed to him. Yet this was among the most blessed marriages in human history. They had six children together: al-Qasim, Zaynab, Ruqayyah, Umm Kulthum, Fatimah, and Abdullah. All sons died in infancy — a grief Allah addressed in Surah al-Kawthar.

WHEN REVELATION CAME:
The Prophet ﷺ returned from the Cave of Hira trembling, saying: "Cover me! Cover me!" Khadijah's response was not panic or doubt — it was the response of a woman who knew her husband's character with absolute certainty. She said: "By Allah, Allah will never disgrace you." Then she listed his qualities — his truthfulness, his care for family, his generosity, his hospitality. She took him to her cousin Waraqah ibn Nawfal, a Christian scholar, who confirmed: "This is the same Namus [Angel Jibreel] that came to Musa." (Bukhari 3).

HER SACRIFICE:
When the Quraysh imposed their three-year boycott, it was Khadijah's wealth that had previously sustained the early Muslim community. She gave everything — and the Prophet ﷺ never forgot. Years after her death, he would send food to her old friends. When a woman came to him who reminded him of Khadijah's time, he ﷺ honoured her warmly. Aishah (RA) said she never felt jealousy toward any of the Prophet's wives except Khadijah — though she had died before Aishah even met the Prophet ﷺ — "because he mentioned her so frequently." (Bukhari 3816).

THE PROPHET'S ﷺ WORDS ABOUT HER:
"She believed in me when no one else did. She accepted Islam when people rejected me. She helped me with her wealth when people deprived me. And Allah blessed me with children through her." (Ahmad — Sahih). When Jibreel came down and said: "O Messenger of Allah, Khadijah is coming to you with food. When she arrives, convey to her the salaam of her Lord and of me, and give her the glad tidings of a house in Paradise made of hollowed pearl, in which there is no noise and no hardship." (Bukhari 3820).

QURANIC REFERENCE:
It was Khadijah's wealth that funded much of the early dawah. She embodied the Quranic ideal: "And those who strive in Our cause — We will surely guide them to Our ways." (29:69). She strove with everything she had.`,
  },
  {
    title: "The First Revelation — Iqra! 📖",
    titleAr: "نزول الوحي — إقرأ",
    year: "610 CE | 27 Ramadan | Jabal al-Nur, Makkah",
    content: `For several years before revelation, the Prophet Muhammad ﷺ had been drawn to solitude and spiritual reflection. He would retreat to the Cave of Hira on Jabal al-Nur (Mountain of Light) — sometimes for days at a time — engaging in tahannuth (spiritual worship, the form of which was inspired by what remained of Ibrahim's religion). He was 40 years old. The month was Ramadan. The date was the 27th.

THE MOMENT:
Aishah (RA) narrated the full account: "The beginning of the Divine Inspiration to Allah's Messenger was in the form of true righteous visions in his sleep. Every vision he had came like the breaking of dawn. Then he was made to love seclusion. He would go to the Cave of Hira and engage in tahannuth — worship for a number of nights. He would take provisions for this and return to Khadijah to take more, until the Truth came to him suddenly while he was in the Cave of Hira." (Bukhari 3).

JIBREEL'S APPEARANCE:
"The Angel came to him and commanded: 'Read!' The Prophet ﷺ said: 'I cannot read.' He took hold of me and squeezed me with so much force that it was unbearable. Then he released me and again commanded: 'Read!' I replied: 'I cannot read.' He squeezed me again a second time — then a third time. Then he said: 'Read in the name of your Lord who created — created man from a clinging substance. Read, and your Lord is the Most Generous — who taught by the pen — taught man that which he knew not.'" (96:1-5). (Bukhari 3).

WHY IQRA FIRST?
The scholars of tafseer note the profound wisdom in the first word being "Iqra" (Read/Recite). Islam is a religion of knowledge, of revelation communicated through language, of a Book. The first command was not "pray" or "fast" but "Read." Ibn Kathir wrote: "Allah began with 'Read' because knowledge is the foundation of all worship."

THE PROPHET'S ﷺ REACTION:
He returned to Khadijah trembling: "Cover me! Cover me!" (Bukhari 3). When the shivering subsided, he said: "What has happened to me?" and told her what he had experienced. His fear was not of the angel per se — but of the enormity of what had been placed upon him. This is the mark of true prophethood — not eagerness for status, but the weight of divine responsibility.

AFTER HIRA — THE PAUSE:
Following the first revelation, there was a pause in revelation (called al-fatrah). The Prophet ﷺ was deeply distressed by this silence. According to some narrations, this pause lasted months. Then the second revelation came: "O you who is wrapped in garments! Arise and warn!" (74:1-2). The pause was a further preparation — allowing the first words to settle deeply into the Prophet's heart before the mission was formally declared.

QURAN ON THIS NIGHT:
"Indeed, We sent it [the Quran] down on the Night of Decree. And what can make you know what is the Night of Decree? The Night of Decree is better than a thousand months. The angels and the Spirit [Jibreel] descend therein by permission of their Lord for every matter. Peace it is until the emergence of dawn." (97:1-5).`,
  },
  {
    title: "Persecution in Makkah — Steadfastness Under Fire 🔥",
    titleAr: "الأذى في سبيل الله",
    year: "613–622 CE | Makkah",
    content: `When the Prophet ﷺ went public with his message in 613 CE, the Quraysh's response was swift and brutal. They could not kill him — he had the tribal protection of Banu Hashim and Abu Talib. So they targeted those with no protection: the poor, the enslaved, the foreigners.

BILAL IBN RABAH (RA):
Bilal was an Abyssinian slave owned by Umayyah ibn Khalaf. When he accepted Islam, his master dragged him into the burning Makkan desert at midday, placed a heavy boulder on his chest, and demanded he renounce Islam and praise al-Lat and al-Uzza. Bilal's only response: "AHAD! AHAD!" (One! One!) — referring to Allah's oneness. Abu Bakr (RA) purchased him and freed him. Bilal became the first muezzin of Islam — that same voice that cried in the desert called the Adhan from atop the Kaabah when Makkah was conquered.

THE FAMILY OF YASIR:
Yasir, his wife Sumayyah, and their son Ammar were tortured relentlessly. The Prophet ﷺ would pass by them and could only say: "Be patient, O family of Yasir! Your promised meeting is Paradise." (Hakim — Sahih). Sumayyah was killed by Abu Jahl — becoming the first martyr in Islam. Her husband Yasir died shortly after from torture. Their son Ammar was eventually forced to utter words of disbelief under torture — and came to the Prophet ﷺ crying. The verse was revealed: "Except for one who is compelled [to disbelief] while his heart is secure in faith." (16:106).

KHABBAB IBN AL-ARAT (RA):
He came to the Prophet ﷺ while he was resting in the shade of the Kaabah and said: "O Messenger of Allah, will you not pray to Allah for us?" The Prophet ﷺ sat up, his face becoming red, and said: "Among those who came before you, a man would be seized and have a trench dug for him, then a saw placed on his head and split in two — yet this would not cause him to leave his religion. By Allah, Allah will complete this matter [Islam] until a rider can travel from Sana'a to Hadramawt fearing no one except Allah." (Bukhari 3612).

QURANIC SOLACE:
Allah repeatedly consoled the believers: "And We will surely test you with something of fear and hunger and a loss of wealth and lives and fruits, but give good tidings to the patient — who, when disaster strikes them, say: Indeed we belong to Allah, and indeed to Him we will return." (2:155-156). And: "Do the people think that they will be left to say 'We believe' and they will not be tried?" (29:2).

THE PROPHET'S ﷺ OWN SUFFERING:
He was pelted with dirt and thorns. His prostrations were interrupted when Abu Jahl placed camel intestines on his back while he prayed. He was called a madman (majnun), a soothsayer (kahin), a poet (sha'ir) — all attempts to discredit the Quran. Allah responded to each claim: "And it is not the word of a poet — little do you believe. Nor the word of a soothsayer — little do you remember. [It is] a revelation from the Lord of the worlds." (69:41-43).

THE LESSON:
The persecution of the early Muslims was not incidental — it was the sieve that purified the faith of those who remained. Every era of Islam's spread was accompanied by trial. Allah promises: "After hardship comes ease." (94:5-6). The question is always: what is our "Ahad!" in the face of pressure?`,
  },
  {
    title: "Al-Isra wal-Miraj — The Night That Changed Everything 🌌",
    titleAr: "الإسراء والمعراج",
    year: "620 CE | 27 Rajab",
    content: `The Year of Grief (619 CE) had devastated the Prophet ﷺ. Within weeks, he had lost his beloved wife Khadijah and his uncle and protector Abu Talib. He had been driven out of Taif with bleeding feet. He was at his most vulnerable. It was in this darkness that Allah sent the greatest honour ever given to any human being.

THE ISRA — THE NIGHT JOURNEY:
"Exalted is He who took His Servant [on] a journey by night from al-Masjid al-Haram to al-Masjid al-Aqsa, whose surroundings We have blessed, to show him of Our signs." (Quran 17:1). The Prophet ﷺ was taken from Makkah to Jerusalem on the Buraq — a white animal smaller than a mule, larger than a donkey, which placed each step at the limit of its sight. At Masjid al-Aqsa, he led all the prophets in salah — confirming his station as their leader and the seal of prophethood.

THE MIRAJ — THE ASCENSION:
From Jerusalem, the Prophet ﷺ ascended through all seven heavens. In each, he met prophets:
• First heaven: Adam (AS)
• Second heaven: Yahya (AS) and Isa (AS)
• Third heaven: Yusuf (AS)
• Fourth heaven: Idris (AS)
• Fifth heaven: Harun (AS)
• Sixth heaven: Musa (AS)
• Seventh heaven: Ibrahim (AS), leaning against al-Bayt al-Ma'mur (the Celestial House visited by 70,000 angels daily)
(Bukhari 3207, Muslim 162)

THE GIFT OF SALAH:
Allah originally prescribed 50 daily prayers. As the Prophet ﷺ descended, Musa (AS) — who had experience with his people — urged him to return and request a reduction. The Prophet ﷺ made multiple returns until the prayers were reduced to five. Allah then said: "These five prayers are [counted as] fifty in reward, for My Word does not change." (Bukhari 349). The five prayers are thus both the easiest obligation and the greatest gift — a direct audience with Allah five times daily.

BEYOND SIDRAT AL-MUNTAHA:
The Prophet ﷺ reached Sidrat al-Muntaha (the Lote Tree of the Utmost Boundary), which is described in the Quran: "When there covered the lote tree that which covered it, the sight [of the Prophet] did not deviate, nor did it transgress [its limit]. He certainly saw of the greatest signs of his Lord." (53:16-18). What the Prophet ﷺ saw beyond this point was never fully described — it was between him and his Lord.

THE REACTION OF THE QURAYSH:
When the Prophet ﷺ reported this journey the next morning, the Quraysh erupted in mockery. Some who had previously been wavering toward Islam now apostatised, saying this was impossible. Abu Bakr (RA) was told about it and immediately said: "If he said it, I believe it" — earning him the title al-Siddiq (the Most Truthful). The Quraysh then tested the Prophet ﷺ by asking him to describe Jerusalem — and he described it perfectly, having never been there before.

SIGNIFICANCE:
The Miraj demonstrates that time and space are no barrier to Allah's will. It confirmed the Prophet's ﷺ unique station. It linked the Ummah eternally to Jerusalem. And it gave us the greatest gift: direct, repeated access to Allah through salah — five times every day. Guard this gift with your life.`,
  },
  {
    title: "The Great Hijrah — Birth of the Islamic State 🌙",
    titleAr: "الهجرة العظمى إلى المدينة المنورة",
    year: "622 CE | Safar | Makkah to Madinah",
    content: `The Hijrah was not merely a physical journey of 450 kilometres. It was the turning point in Islamic history — the moment a persecuted community became a state, a faith became a civilisation, and a prophet became also a statesman. The Islamic calendar (Hijri calendar) begins with this event — a choice made by Umar ibn al-Khattab (RA) during the caliphate of Umar — because it was the moment Islam moved from survival to establishment.

THE ASSASSINATION PLOT:
The Quraysh convened in Dar al-Nadwa (their council house) to decide what to do about the Prophet ﷺ. They settled on having one young man from each tribe simultaneously stab him — so blood guilt would be shared across all tribes and Banu Hashim could not retaliate. Allah informed His Prophet ﷺ: "And [remember, O Muhammad], when those who disbelieved plotted against you to restrain you or kill you or evict you [from Makkah]. But they plan, and Allah plans. And Allah is the best of planners." (Quran 8:30).

THE DEPARTURE:
The Prophet ﷺ asked Ali (RA) to sleep in his bed — wrapped in the Prophet's green Hadhrami cloak — to make the house appear occupied. Ali (RA) agreed without hesitation. The Prophet ﷺ then walked out past the armed men surrounding his house — reciting the opening verses of Surah Ya-Sin: "And We have put before them a barrier and behind them a barrier and covered them, so they do not see." (36:9). None of the assassins saw him. He met Abu Bakr (RA) and they departed south — in the opposite direction of Madinah, to confuse pursuit.

THE CAVE OF THAWR:
They sheltered for three days in a cave on Mount Thawr. The Quraysh offered 100 camels reward for their capture. Search parties came within metres of the cave entrance. Abu Bakr (RA) whispered, trembling: "O Messenger of Allah, if one of them looks down at his feet he will see us." The Prophet ﷺ replied — and this reply became one of the most famous words in Islamic history: "O Abu Bakr, what do you think of two when Allah is their third?" Allah recorded this moment in the Quran: "If you do not aid him, Allah has already aided him when those who disbelieved had driven him out [of Makkah] as one of two, when they were in the cave and he said to his companion: Do not grieve; indeed Allah is with us." (9:40). A spider had woven its web across the cave entrance. A pair of pigeons had nested there. The search party concluded no one had entered recently.

THE ARRIVAL IN MADINAH:
When news spread that the Prophet ﷺ was approaching, the people of Madinah — men, women, children — came out singing: "Tala'al badru alayna min thaniyyatil wada' — The full moon has risen over us from the valley of farewell." Children climbed rooftops. Tears flowed. Every household wanted the honour of hosting him. He let his camel (Qaswa) walk freely and built his mosque wherever she sat.

QURANIC REASSURANCE FOR THE EXILED:
"Those who have been evicted from their homes without right — only because they say: Our Lord is Allah." (22:40). And: "And whoever emigrates for the cause of Allah will find on the earth many [alternative] locations and abundance." (4:100). And perhaps most powerfully: "Indeed, with hardship will be ease." (94:6).

THE LESSON:
The Hijrah teaches that when you give up something for Allah, Allah replaces it with better. The Muhajirin left homes, wealth, and family. They gained the brotherhood of the Ansar, the establishment of the first Islamic community, and the eternal honour of being among the Prophet's ﷺ closest generation. What are you willing to leave behind for the sake of Allah?`,
  },
  {
    title: "Battle of Badr — Truth Against Falsehood ⚔️",
    titleAr: "غزوة بدر الكبرى — يوم الفرقان",
    year: "624 CE | 17 Ramadan, 2 AH | Wells of Badr",
    content: `Badr was not just a battle — it was the moment the world was forced to take Islam seriously. The Quran itself named it Yawm al-Furqan — the Day of Distinction between truth and falsehood. 313 poorly-armed Muslims stood against 1,000 experienced Qurayshi warriors with full armour, cavalry, and supplies. By every calculation of power, the Muslims should have been annihilated.

THE NUMBERS:
• Muslims: 313 men, 70 camels (shared for travel — not cavalry), 8 swords. The majority were on foot.
• Quraysh: approximately 1,000 warriors, 100 cavalry on horses, full armour and weapons.

THE PROPHET'S ﷺ PRAYER:
The night before Badr, the Prophet ﷺ stood in prayer crying and making dua until dawn. He raised his hands and said: "O Allah, if this group [of believers] is destroyed today, You will not be worshipped on earth." (Muslim 1763). Abu Bakr (RA) eventually took his arm and said: "O Messenger of Allah, Allah will fulfil His promise to you." The Prophet ﷺ then slept briefly — a sign of absolute trust (tawakkul) in Allah — and woke with the news that Allah had sent reinforcements.

DIVINE REINFORCEMENT:
"[Remember] when you asked help of your Lord, and He answered you: Indeed, I will reinforce you with a thousand from the angels, following one another." (Quran 8:9). And: "And Allah did not make it except as [a sign of] good tidings and so that your hearts would be assured thereby. And victory is not except from Allah. Indeed, Allah is Exalted in Might and Wise." (8:10).

THE BATTLE:
Single combat began with Ali (RA), Hamzah (RA), and Ubaydah ibn al-Harith (RA) defeating the Qurayshi champions. Then full combat broke out. The Prophet ﷺ picked up a handful of pebbles and threw them toward the enemy saying: "Shahat al-wujuh!" (May the faces be disfigured!). Allah says about this: "And you did not throw when you threw, but it was Allah who threw." (8:17). The Qurayshi lines broke. Abu Jahl — one of the Prophet's most vicious persecutors — was found dying and killed by two young Ansar boys, Muadh and Muawwidh.

THE OUTCOME:
70 Qurayshi leaders killed. 70 captured. Major figures of opposition — Abu Jahl, Umayyah ibn Khalaf, Utbah ibn Rabi'a — all dead. The Muslims lost 14 men, all of whom were granted the status of shuhadaa (martyrs) and Paradise.

THE PRISONERS OF BADR:
The Prophet ﷺ treated the prisoners with remarkable dignity. The Ansar gave their prisoners their own food and ate dates themselves. Those among the prisoners who knew how to read and write were offered their freedom in exchange for teaching ten Muslim children to read — an extraordinary civilisational decision. The Quran encouraged ransom but left the door open for grace: "Thereafter [is] either a gracious release or ransom until the war lays down its burdens." (47:4).

QURANIC CHAPTER:
An entire surah — Surah al-Anfal (Chapter 8) — was revealed largely in the context of Badr, addressing divine help, the ethics of war, the distribution of spoils, and the character required of the believing community.

THE LESSON:
Badr teaches that victory belongs not to the larger army, but to the army that has Allah. Numbers, weapons, and resources matter — but tawakkul (reliance on Allah) combined with proper preparation is the true formula. The Prophet ﷺ prepared: he scouted, he strategised, he consulted companions like al-Hubab ibn al-Mundhir about water positioning. Then he prayed and trusted. Preparation + Prayer + Tawakkul = the Badr formula.`,
  },
  {
    title: "The Conquest of Makkah — Mercy Over Victory 🌟",
    titleAr: "فتح مكة المكرمة — العفو عند المقدرة",
    year: "630 CE | 20 Ramadan, 8 AH",
    content: `The Conquest of Makkah stands as one of the most remarkable events in human history — not for the military triumph, but for what the victor chose to do with his power. The Prophet ﷺ had been expelled from Makkah 8 years earlier with a price on his head. His companions had been tortured, killed, and stripped of their wealth and homes. Now, with 10,000 warriors, he returned victorious. What would history record?

THE BREACH OF HUDAYBIYYAH:
The Quraysh's allies (Banu Bakr) attacked the Prophet's ﷺ allies (Banu Khuza'ah) — a direct violation of the Treaty of Hudaybiyyah. The Khuza'ah sent messengers to Madinah. The Prophet ﷺ set out with the largest army yet assembled — 10,000 companions. So secretly did he march that Abu Sufyan (the Qurayshi leader) learned of it only when he was already near Makkah. Abu Sufyan sought the Prophet's ﷺ uncle Abbas (RA), who escorted him to the Prophet's camp.

ABU SUFYAN'S CONVERSION:
Standing before the Prophet ﷺ, Abbas said: "O Messenger of Allah, Abu Sufyan loves honour — give him something." The Prophet ﷺ said: "Whoever enters the house of Abu Sufyan is safe. Whoever enters the Masjid al-Haram is safe. Whoever closes his door is safe." (Muslim 1780). Abu Sufyan accepted Islam.

THE ENTRY INTO MAKKAH:
On the morning of 20 Ramadan, 8 AH, the Prophet ﷺ entered Makkah on his she-camel al-Qaswa, his head bowed in humility — not in the posture of a conqueror but of a servant of Allah. He was reciting Surah al-Fath. He wore no crown, no special garments of conquest. The army entered in four columns. Almost no blood was shed.

THE KAABAH — CLEANSED:
360 idols surrounded the Kaabah. The Prophet ﷺ began toppling them with his staff, reciting: "Truth has come, and falsehood has departed. Indeed, falsehood is [by nature] ever bound to depart." (Quran 17:81). Bilal (RA) climbed to the top of the Kaabah — the same man who had been dragged through the sand crying "Ahad!" — and called the Adhan. Former slave now calls from the highest point of the holiest house.

THE MOMENT OF JUDGMENT:
The Quraysh gathered in the Masjid al-Haram, terrified. They knew what they had done. The Prophet ﷺ addressed them: "O Quraysh! What do you think I am going to do with you?" They replied: "We think [you will treat us] well. You are a noble brother, son of a noble brother." He ﷺ said: "Go — you are free." (Ibn Hisham, authenticated chain). This was not weakness — it was the calculated mercy of a Prophet who was sent as "a mercy to the worlds" (Quran 21:107).

QURANIC PROMISE FULFILLED:
"Indeed, He who imposed upon you the Quran [i.e., its recitation and its rulings] will take you back to a place of return." (28:85). When this verse was revealed during the Hijrah, the scholars of tafseer say it promised the Prophet ﷺ he would return to Makkah. And so he did.

THE LESSON:
The Prophet ﷺ had the power to destroy his enemies. He chose forgiveness. This is not naivety — it is the highest form of wisdom and strength. As he ﷺ himself taught: "The strong person is not the one who can wrestle; the truly strong person is the one who controls himself when angry." (Bukhari 6114). The Conquest of Makkah is not a story of military victory. It is a story of moral victory — of proving that Islam came not to conquer lands, but to conquer hearts.`,
  },
  {
    title: "The Farewell Sermon — Last Words of the Last Prophet ﷺ 📣",
    titleAr: "خطبة الوداع — الرسالة الأخيرة",
    year: "632 CE | 9 Dhul Hijjah, 10 AH | Arafat",
    content: `The Prophet ﷺ performed only one Hajj in his lifetime — 10 AH, just three months before his death. Standing on the plain of Arafat on the Day of Arafah, before over 100,000 companions, he delivered what would become known as the Farewell Sermon (Khutbat al-Wada'). Those who heard it knew they were hearing something they would carry for the rest of their lives.

THE UNIVERSAL DECLARATION OF HUMAN RIGHTS — 1,400 YEARS BEFORE THE UN:
"O People! Your blood, your property, and your honour are sacred to one another, as sacred as this day, this month, and this city." (Bukhari 1739). He abolished all pre-Islamic blood feuds: "Every claim of blood from the pre-Islamic period is under my feet — abolished and cancelled." He abolished all usurious interest: "All riba [interest] from the pre-Islamic period is abolished."

ON THE RIGHTS OF WOMEN:
"O people, you have rights over your women, and your women have rights over you." He commanded kind treatment of women: "Fear Allah regarding women — for you have taken them as a trust from Allah." This was revolutionary in a society where women had limited legal standing.

ON RACIAL EQUALITY — 1,300 YEARS BEFORE THE CIVIL RIGHTS MOVEMENT:
"O people! Your Lord is One, and your father [Adam] is one. An Arab has no superiority over a non-Arab, nor does a non-Arab have superiority over an Arab. A white person has no superiority over a black person, nor does a black person have superiority over a white person — except through taqwa (God-consciousness)." (Ahmad — Sahih). This was not merely a proclamation — it was a demolition of the entire tribal hierarchy of Arabia.

ON THE PRESERVATION OF THE MESSAGE:
"I am leaving among you two things. You will never go astray as long as you hold onto them: the Book of Allah and my Sunnah." (Muwatta Malik, authenticated). He then asked: "Have I delivered the message?" The crowd of over 100,000 people replied as one: "Yes!" He raised his finger to the sky three times and said: "O Allah, be witness! O Allah, be witness! O Allah, be witness!"

THE FINAL REVELATION:
On this day, or shortly before it, came the final complete verse: "This day I have perfected for you your religion and completed My favour upon you and have approved for you Islam as religion." (Quran 5:3). When Abu Bakr (RA) heard this verse, he wept. People asked why. He said: "When a thing is perfected, it can only decrease." He understood that this completeness meant the Prophet ﷺ would soon leave them.

THE LESSON:
The Farewell Sermon is the Prophet's ﷺ gift to humanity — a manifesto of justice, equality, dignity, and faith. It speaks across centuries with the same urgency. Read it. Memorise it. Teach it to your children. It is the last will and testament of the Final Prophet. And the most solemn obligation it places on us is this: to carry the message forward exactly as he delivered it, until the Day it is presented back to Allah.`,
  },
];

// ── Islamic Events (Hijri-based) ──────────────────────────────────────────
export const ISLAMIC_EVENTS = [
  { hijriMonth: 1,  hijriDay: 1,  name: "Islamic New Year",           nameAr: "رأس السنة الهجرية",     emoji: "🌙", daysWindow: 4, writeup: "The Islamic New Year marks the beginning of Muharram and commemorates the Hijrah — the Prophet's ﷺ migration from Makkah to Madinah in 622 CE. Umar ibn al-Khattab (RA) chose this event as the start of the Islamic calendar, because it represents the moment faith became a state and conviction became a civilisation. The Prophet ﷺ said about Muharram: 'The best fasts after Ramadan are in the month of Allah, which you call Muharram.' (Muslim 1163). Use this new year to make sincere tawbah, set learning goals for the year, increase fasting, and renew your covenant with Allah. 'Indeed, the number of months with Allah is twelve months in the register of Allah [from] the day He created the heavens and the earth; of these, four are sacred.' (9:36)" },
  { hijriMonth: 1,  hijriDay: 10, name: "Day of Ashura",              nameAr: "يوم عاشوراء",            emoji: "🤲", daysWindow: 4, writeup: "The 10th of Muharram — Ashura — is among the most blessed individual days in the Islamic calendar. When the Prophet ﷺ arrived in Madinah and found the Jews fasting, he was told: 'This is the day Allah saved Musa (AS) and the Israelites from Pharaoh, and drowned Pharaoh and his army.' He ﷺ said: 'We have more right to Musa than you,' and he fasted and ordered fasting. (Bukhari 2004). The reward: 'I hope Allah will expiate the sins of the previous year.' (Muslim 1162). Ibn Abbas (RA) narrated the Prophet's ﷺ intention to also fast the 9th: 'If I live until next year, I will certainly fast the 9th as well.' (Muslim 1134) — combining both days distinguishes Islamic practice. It is also a day of generosity toward family, based on narrations of Ibn Masud (RA) compiled by Ibn Rajab al-Hanbali. This Ashura, fast the 9th and 10th, give sadaqah, and remember the story of Musa (AS) — it is your story too: Allah saves those who trust in Him, no matter the power of Pharaoh." },
  { hijriMonth: 3,  hijriDay: 12, name: "Mawlid al-Nabawi ﷺ",         nameAr: "المولد النبوي الشريف",   emoji: "💛", daysWindow: 7, writeup: "The 12th of Rabi al-Awwal is the birth date of the Prophet Muhammad ﷺ according to the majority of scholars. Allah describes him: 'There has certainly come to you a Messenger from among yourselves. Grievous to him is what you suffer; [he is] concerned over you and to the believers is kind and merciful.' (9:128). And: 'We have not sent you except as a mercy to the worlds.' (21:107). This is the most beautiful time to study his ﷺ life, read Seerah, send abundant salawat upon him ('Allahumma salli ala Muhammad wa ala ali Muhammad, kama sallayta ala Ibrahim...'), and gather to remember his virtues. The Prophet ﷺ himself honoured the day of his birth by fasting on Mondays, saying: 'That is the day I was born.' (Muslim 1162). The best celebration of his ﷺ birthday is to follow him — in salah, in honesty, in mercy to all creation, in knowledge, and in character." },
  { hijriMonth: 7,  hijriDay: 27, name: "Isra' and Mi'raj",            nameAr: "الإسراء والمعراج",       emoji: "🌌", daysWindow: 5, writeup: "On this night, Allah took His Prophet ﷺ on the greatest journey in human history — from Makkah to Jerusalem and then through all seven heavens to the Divine Presence. Allah says: 'Exalted is He who took His Servant by night from al-Masjid al-Haram to al-Masjid al-Aqsa, whose surroundings We have blessed, to show him of Our signs.' (17:1). The five daily prayers were gifted to this Ummah on this night — reduced from fifty through Musa's counsel. Allah said: 'These five are [counted as] fifty in reward, for My Word does not change.' (Bukhari 349). Reflect tonight: the five prayers are not a burden but the most precious gift — a direct audience with Allah five times every single day. The Prophet ﷺ confirmed their centrality: 'The first matter that the slave will be brought to account for on the Day of Judgement is the prayer. If it is sound, all his deeds will be sound. And if it is corrupt, all his deeds will be corrupt.' (Tabarani — Sahih). Guard your salah this blessed night." },
  { hijriMonth: 8,  hijriDay: 15, name: "Laylat al-Bara'ah",           nameAr: "ليلة النصف من شعبان",   emoji: "✨", daysWindow: 4, writeup: "The 15th night of Sha'ban is the night some scholars identify as one of special divine mercy, based on narrations that Allah looks upon His creation with special attention. Whether one holds this specific view or not, Sha'ban is unambiguously a month of spiritual opportunity. The Prophet ﷺ said: 'It is a month between Rajab and Ramadan that people neglect. It is a month in which deeds are raised to the Lord of the worlds, and I love my deeds to be raised while I am fasting.' (Nasa'i — Hasan). The Prophet ﷺ would fast most of Sha'ban (Bukhari 1969). Use this month to: complete any missed Ramadan fasts (before the next Ramadan), increase optional fasting (especially Mondays and Thursdays), resolve any grievances with fellow Muslims, perform a full Quran khatm, and set your Ramadan goals and schedule now — so you enter Ramadan prepared, not scrambling." },
  { hijriMonth: 9,  hijriDay: 1,  name: "Ramadan Begins",              nameAr: "بداية رمضان المبارك",   emoji: "🌙", daysWindow: 4, writeup: "Ramadan — the month of the Quran — has arrived. 'The month of Ramadan in which was revealed the Quran, a guidance for the people and clear proofs of guidance and criterion.' (2:185). In a Hadith Qudsi, Allah says: 'Every deed of the son of Adam is for him except fasting — it is for Me and I will give the reward for it.' (Bukhari 7492). The gates of Paradise are opened, the gates of Hellfire closed, and the shayateen chained. (Bukhari 1899). The Prophet ﷺ said: 'Whoever fasts Ramadan with faith and seeking reward, his previous sins will be forgiven.' (Bukhari 38). Set your goals NOW: How many pages of Quran daily? Which nights will you pray tahajjud? How much will you give in sadaqah? Remember: Ramadan is not the month of food — it is the month of the Quran. 'And recite the Quran with measured recitation.' (73:4). Marhaban ya Ramadan! 🌙" },
  { hijriMonth: 9,  hijriDay: 21, name: "Last Ten Nights of Ramadan",  nameAr: "العشر الأواخر من رمضان", emoji: "⭐", daysWindow: 10, writeup: "The last ten nights of Ramadan contain the most precious time of the entire year. Aishah (RA) reported: 'When the last ten nights of Ramadan would come, the Prophet ﷺ would tighten his waist-wrapper, stay awake through the night, and wake his family.' (Bukhari 2024). He ﷺ said: 'Seek Laylat al-Qadr in the odd nights of the last ten of Ramadan.' (Bukhari 2017). Laylat al-Qadr is 'better than a thousand months.' (97:3) — that is over 83 years of worship in a single night. The best dua for this night is what the Prophet ﷺ himself taught Aishah (RA): 'Allahumma innaka afuwwun tuhibbul afwa fa'fu anni' — O Allah, You are the Pardoner, You love to pardon, so pardon me. (Tirmidhi 3513 — Sahih). In these nights: stand in prayer. Cry. Ask for everything — your parents, your children, the Ummah, the oppressed, your deepest needs. Do not let these nights pass in sleep." },
  { hijriMonth: 9,  hijriDay: 27, name: "Laylat al-Qadr",              nameAr: "ليلة القدر المباركة",    emoji: "🌟", daysWindow: 3, writeup: "Laylat al-Qadr — the Night of Power — is the most blessed night in the history of creation. On this night the Quran descended from the Lawh al-Mahfudh (Preserved Tablet) to Bayt al-Izzah in the lowest heaven. 'The Night of Decree is better than a thousand months. The angels and the Spirit [Jibreel] descend therein by permission of their Lord for every matter.' (97:3-4). The Prophet ﷺ said: 'Whoever stands in prayer on Laylat al-Qadr with faith and seeking reward, his previous sins will be forgiven.' (Bukhari 35). Ibn Abbas (RA) said the meaning of 'for every matter' is that the angels bring down the decrees for the coming year — rizq (provision), life, death, marriages, children. Your dua tonight could shape the next year of your life. Pray Isha and Fajr in jamaat (the reward of the whole night). Stand in tahajjud. Give sadaqah. Read Quran. Cry. Make dua for your parents, your family, the Muslims worldwide. Tonight could change your eternity." },
  { hijriMonth: 10, hijriDay: 1,  name: "Eid al-Fitr",                nameAr: "عيد الفطر المبارك",      emoji: "🎉", daysWindow: 3, writeup: "Eid al-Fitr is Allah's gift to the believers as a celebration after a month of sincere worship. The Prophet ﷺ said: 'The fasting person has two moments of joy: when he breaks his fast and when he meets his Lord.' (Bukhari 7492). Before Eid prayer, give Zakat al-Fitr — the Prophet ﷺ made this obligatory: 'Zakat al-Fitr purifies the fasting person from idle talk and obscenities, and provides food for the poor.' (Abu Dawud 1609 — Sahih). The takbir begins from Eid eve: 'Allahu Akbar, Allahu Akbar, la ilaha illAllah, Allahu Akbar, Allahu Akbar wa lillahil hamd.' Wear your best, take different routes to and from Eid prayer (Sunnah), greet every Muslim with warmth, visit family, give gifts to children. And to preserve Ramadan's spirit: fast six days of Shawwal — the Prophet ﷺ said: 'Whoever fasts Ramadan and then follows it with six days of Shawwal, it will be as though he fasted the entire year.' (Muslim 1164). Eid Mubarak!" },
  { hijriMonth: 12, hijriDay: 1,  name: "First Days of Dhul Hijjah",   nameAr: "أيام ذي الحجة المباركة", emoji: "🕋", daysWindow: 10, writeup: "The first ten days of Dhul Hijjah are the most beloved days to Allah. The Prophet ﷺ said: 'There are no days in which righteous deeds are more beloved to Allah than these ten days.' The companions asked: 'Not even jihad in the path of Allah?' He replied: 'Not even jihad in the path of Allah — except a man who goes out with his life and his wealth and does not return with either.' (Bukhari 969). The deeds to multiply: fasting (especially the 9th — Day of Arafah), sadaqah, Quran recitation, dhikr ('La ilaha illAllah, Allahu Akbar, Alhamdulillah, Subhanallah'), salat al-duha, maintaining ties of kinship, and for those with the means — Udhiyah (sacrifice). 'That [is so], and whoever honours the symbols of Allah — indeed it is from the piety of hearts.' (22:32). These days are a Ramadan for those who did not fully benefit from Ramadan. Do not let them pass." },
  { hijriMonth: 12, hijriDay: 9,  name: "Day of Arafah",               nameAr: "يوم عرفة الأعظم",        emoji: "🕋", daysWindow: 2, writeup: "The Day of Arafah is the greatest day of the year and the very heart of Hajj — 'Al-Hajju Arafah' (Hajj is Arafah). (Abu Dawud 1949 — Sahih). Over two million pilgrims stand on the plain of Arafat from after Dhuhr to sunset, making dua, weeping, and seeking forgiveness. The Prophet ﷺ said: 'There is no day on which Allah frees more servants from the Fire than the Day of Arafah. He comes close and then boasts to the angels, saying: What do these people want?' (Muslim 1348). For non-pilgrims: fasting this day expiates two years of sins — the previous year and the coming year. (Muslim 1162). Make abundant dua between Dhuhr and Maghrib — these are among the most accepted hours in the year. Recite frequently: 'La ilaha illAllah wahdahu la sharika lah, lahul mulku wa lahul hamdu wa huwa ala kulli shay'in qadir.' The Prophet ﷺ said the best dua is the dua of Arafah. (Tirmidhi 3585 — Hasan)." },
  { hijriMonth: 12, hijriDay: 10, name: "Eid al-Adha",                nameAr: "عيد الأضحى المبارك",     emoji: "🐑", daysWindow: 4, writeup: "Eid al-Adha commemorates the supreme test of Ibrahim (AS) — commanded by Allah in a dream to sacrifice his son Ismail (AS). Ibrahim and Ismail both submitted completely: 'And when they had both submitted and he put him down upon his forehead, We called to him: O Ibrahim! You have fulfilled the vision.' (37:103-104). Allah replaced the sacrifice with a ram: 'And We ransomed him with a great sacrifice.' (37:107). The Udhiyah (sacrifice) we perform carries this spirit of complete submission. Remember: 'Their meat will not reach Allah, nor will their blood, but what reaches Him is piety from you.' (22:37). The sacrifice should be shared: one-third for family, one-third for neighbours, one-third for the poor. The Prophet ﷺ sacrificed with his own hand and said: 'O Allah, this is from Muhammad and the family of Muhammad and the Ummah of Muhammad.' (Muslim 1967). May our lives be a complete sacrifice — of our time, ego, desires, and wealth — for the sake of Allah. Eid Adha Mubarak! 🕋" },
];

// ── Types ─────────────────────────────────────────────────────────────────
interface LiveHadith {
  ar?: string;
  en: string;
  source: string;
  narrator: string;
  grade: string;
  explanation: string;
}
interface NewsItem {
  title: string;
  link: string;
  description: string;
  thumbnail: string;
  pubDate: string;
}
type TabId = "hadith" | "seerah" | "event" | "news" | "tawheed";

// ─── TAWHEED LESSON DATA ────────────────────────────────────────────────────
interface TawheedLesson {
  module: string;
  moduleBg: string; moduleBadge: string; moduleBorder: string;
  titleEn: string; titleAr: string; subtitleEn: string;
  quranicProof: { ar: string; en: string; ref: string };
  hadith: { ar: string; en: string; source: string };
  explanation: string;
}

export const TAWHEED_LESSONS: TawheedLesson[] = [
  {
    module: "Tawheed al-Rububiyyah",
    moduleBg: "#e8f5e9", moduleBadge: "#2e7d32", moduleBorder: "#a5d6a7",
    titleEn: "Allah Alone Creates, Sustains & Controls",
    titleAr: "اللَّهُ وَحْدَهُ الخَالِقُ الرَّازِقُ المُدَبِّرُ",
    subtitleEn: "No partner shares in Allah's lordship over all creation",
    quranicProof: { ar: "أَلَا لَهُ الْخَلْقُ وَالْأَمْرُ ۗ تَبَارَكَ اللَّهُ رَبُّ الْعَالَمِينَ", en: "Unquestionably, His is the creation and the command. Blessed is Allah, Lord of the worlds.", ref: "Quran 7:54" },
    hadith: { ar: "إِنَّ اللَّهَ صَنَعَ كُلَّ صَانِعٍ وَصَنْعَتَهُ", en: "Indeed Allah created every craftsman and his craft.", source: "Musnad Ahmad 7957 · Silsilah al-Sahihah 1637" },
    explanation: `Tawheed al-Rububiyyah means singling out Allah in everything related to His Lordship — creation (khalq), ownership (mulk), sustenance (rizq), and control of all affairs (tadbeer). He alone brings the living from the dead and the dead from the living.\n\nLIVE EXAMPLE: A surgeon performs a heart bypass. The scalpel, the surgeon's hands, the machine — these are all means (asbab). The actual mending of flesh and return of the heartbeat — that is Allah's act. Ibrahim (AS) declared: "And when I am ill, it is He who cures me." (26:80). A Muslim doctor says after a successful surgery: "Alhamdulillah, Allah cured him through my hands."\n\nLIVE EXAMPLE 2: Your salary is late. Panic sets in. Allah is al-Razzaq — the Provider — and He does not forget. "And how many a creature carries not its own provision, but Allah provides for it and for you." (29:60). Your employer is a means, not the source.\n\nKEY POINT: Even the Quraysh acknowledged this category — "If you ask them who created the heavens and earth, they will certainly say: Allah." (39:38). This alone was not enough. What was missing was Tawheed al-Uluhiyyah.`
  },
  {
    module: "Tawheed al-Rububiyyah — Al-Qadar",
    moduleBg: "#e8f5e9", moduleBadge: "#2e7d32", moduleBorder: "#a5d6a7",
    titleEn: "Al-Qadar — The Divine Decree",
    titleAr: "الإيمانُ بِالقَضَاءِ والقَدَرِ",
    subtitleEn: "Nothing happens in creation except by Allah's prior knowledge, will, and decree",
    quranicProof: { ar: "مَا أَصَابَ مِن مُّصِيبَةٍ إِلَّا بِإِذْنِ اللَّهِ ۗ وَمَن يُؤْمِن بِاللَّهِ يَهْدِ قَلْبَهُ", en: "No disaster strikes except by permission of Allah. And whoever believes in Allah — He will guide his heart.", ref: "Quran 64:11" },
    hadith: { ar: "وَاعْلَمْ أَنَّ الأُمَّةَ لَوِ اجْتَمَعَتْ عَلَى أَنْ يَنْفَعُوكَ بِشَيْءٍ لَمْ يَنْفَعُوكَ إِلَّا بِشَيْءٍ قَدْ كَتَبَهُ اللَّهُ لَكَ", en: "Know that if the entire nation gathered to benefit you, they could not benefit you except with what Allah has already written for you.", source: "Jami' al-Tirmidhi 2516 · Sahih" },
    explanation: `The four pillars of Iman in al-Qadar: (1) 'Ilm — Allah knew all things eternally. (2) Kitabah — He wrote everything in al-Lawh al-Mahfoodh fifty thousand years before the heavens and earth were created. (3) Mashee'ah — nothing happens except by His will. (4) Khalq — He created everything, including human actions.\n\nLIVE EXAMPLE: You work for years building a business. A flood destroys it overnight. The nafs says: "If only I had chosen a different location." Iman in Qadar says: this trial was written before you were born. Ibn Abbas (RA) narrates: "The pen has been lifted and the pages have dried." Your response is NOT passivity — you rebuild with tawakkul — but it IS freedom from destructive regret.\n\nKEY POINT: Qadar does NOT eliminate accountability. We have real choices and are judged for them. The Prophet ﷺ said: "Act — for everyone is facilitated toward what they were created for." (Bukhari 4949). The decree and the effort both belong to Allah's plan.`
  },
  {
    module: "Tawheed al-Uluhiyyah",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "The Meaning of Laa ilaaha illallaah",
    titleAr: "مَعْنَى لَا إِلٰهَ إِلَّا ٱللَّهُ",
    subtitleEn: "The greatest statement ever uttered — its negation and its affirmation",
    quranicProof: { ar: "فَاعْلَمْ أَنَّهُ لَا إِلَٰهَ إِلَّا اللَّهُ وَاسْتَغْفِرْ لِذَنبِكَ", en: "So know that there is no deity except Allah and ask forgiveness for your sin.", ref: "Quran 47:19" },
    hadith: { ar: "أَفْضَلُ مَا قُلْتُهُ أَنَا وَالنَّبِيُّونَ مِنْ قَبْلِي: لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", en: "The best thing I and the prophets before me have said is: There is no deity except Allah, alone, with no partner.", source: "Muwatta Malik · Tirmidhi 3585 — Hasan Sahih" },
    explanation: `"Laa ilaaha" is the NEGATION — there is no true god, no being worthy of worship, no object deserving the heart's ultimate love, fear, hope, and obedience. "Illallaah" is the AFFIRMATION — except Allah.\n\nLIVE EXAMPLE: A student loves someone so deeply that their happiness, mood, and decisions all revolve around that person's approval. This is an "ilaah" the heart has set up. Tawheed al-Uluhiyyah does NOT say: "Don't love people." It says: the ultimate, controlling love must be for Allah. "And those who believe are strongest in love for Allah." (2:165).\n\nLIVE EXAMPLE 2: A businessperson compromises their deen — lies, deals in haram — because they fear poverty more than they fear Allah. They have made wealth their "ilaah." Tawheed means: your fear, ultimately, must be of Allah alone. "So do not fear them, but fear Me." (2:150).\n\nCONDITIONS of Laa ilaaha illallaah (7): Knowledge of its meaning · Certainty · Acceptance · Submission and compliance · Truthfulness from the heart · Sincerity (ikhlas) · Love of what it demands.`
  },
  {
    module: "Tawheed al-Uluhiyyah — Du'a",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Du'a is the Marrow of Worship",
    titleAr: "الدُّعَاءُ مُخُّ العِبَادَةِ",
    subtitleEn: "Directing supplication to other than Allah is shirk regardless of intention",
    quranicProof: { ar: "وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ ۚ إِنَّ الَّذِينَ يَسْتَكْبِرُونَ عَنْ عِبَادَتِي سَيَدْخُلُونَ جَهَنَّمَ دَاخِرِينَ", en: "And your Lord says: Call upon Me; I will respond to you. Indeed those who disdain My worship will enter Hellfire in humiliation.", ref: "Quran 40:60" },
    hadith: { ar: "الدُّعَاءُ هُوَ الْعِبَادَةُ", en: "Du'a is worship itself.", source: "Jami' al-Tirmidhi 2969 — Nu'man ibn Bashir رضي الله عنه · Sahih" },
    explanation: `Allah equates calling upon Him (du'a) with worshipping Him ('ibadah). Therefore, directing du'a to any being other than Allah — whether a prophet, angel, saint, or jinn — is directing worship to other than Allah. This is shirk al-akbar.\n\nLIVE EXAMPLE: A Muslim visits the grave of a righteous scholar and says: "Ya Shaykh, my son is sick — cure him." Even with good intention, this is shirk. The dead cannot hear individual petitions (27:80, 35:22). The correct practice: stand at the grave, make du'a TO ALLAH, ask Allah for HIS mercy, then ask Allah for your own need — directly, with no intermediary.\n\nLIVE EXAMPLE 2: Before a major exam, someone says: "Ya Rasulallah, help me pass." This is widespread but contradicts Tawheed. What IS correct: "Allahumma salli 'ala Muhammad" — asking ALLAH to honour His Prophet. Then: "Ya Allah, make this easy for me." We ask ALLAH for everything. We do not ask the Prophet ﷺ for things — that is the role of Allah alone.`
  },
  {
    module: "Tawheed al-Uluhiyyah — Shirk Asghar",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Shirk al-Asghar — Riya', The Hidden Destroyer",
    titleAr: "الشِّرْكُ الأَصْغَرُ — الرِّيَاءُ",
    subtitleEn: "Doing deeds for people's approval alongside Allah — the most feared corruption",
    quranicProof: { ar: "فَمَن كَانَ يَرْجُو لِقَاءَ رَبِّهِ فَلْيَعْمَلْ عَمَلًا صَالِحًا وَلَا يُشْرِكْ بِعِبَادَةِ رَبِّهِ أَحَدًا", en: "So whoever hopes to meet his Lord — let him do righteous work and not associate in the worship of his Lord anyone.", ref: "Quran 18:110" },
    hadith: { ar: "إِنَّ أَخْوَفَ مَا أَخَافُ عَلَيْكُمُ الشِّرْكُ الأَصْغَرُ — الرِّيَاءُ", en: "The thing I fear most for you is minor shirk — showing off (riya').", source: "Musnad Ahmad 23119 · Sahih li-ghayrihi" },
    explanation: `Minor shirk DESTROYS the deeds it contaminates entirely. In a Hadith Qudsi, Allah says on the Day of Judgment: "Whoever does a deed associating anything with Me — I leave him and his shirk." (Muslim 2985). The deed is completely void.\n\nLIVE EXAMPLE: A student recites Quran beautifully when the teacher is present, pouring emotion into every word. Alone at home, they rush through it carelessly. Ibn al-Qayyim's test: "Does your 'ibadah increase when people are watching? Then you are worshipping their gaze alongside Allah."\n\nLIVE EXAMPLE 2: Social media posts about tahajjud, fasting, charity — the scholars warn: sharing good deeds can be permissible if the intention is to inspire AND the heart is checked. But when the motivation is "likes" — the dopamine from approval — it has entered riya'. Check your intention BEFORE posting.\n\nTHE CURE: Increase secret acts of worship that no one knows about — a private nightly du'a, a hidden sadaqah. What is hidden from people but known to Allah is the most sincere.`
  },
  {
    module: "Tawheed al-Asmaa' wa al-Sifaat",
    moduleBg: "#f3e5f5", moduleBadge: "#6b21a8", moduleBorder: "#ce93d8",
    titleEn: "Allah's Names & Attributes — The Correct Method",
    titleAr: "أَسْمَاءُ اللَّهِ وَصِفَاتُهُ — مَنْهَجُ أَهْلِ السُّنَّةِ",
    subtitleEn: "Affirm what Allah affirmed, deny what He denied — without asking 'how'",
    quranicProof: { ar: "لَيْسَ كَمِثْلِهِ شَيْءٌ ۖ وَهُوَ السَّمِيعُ الْبَصِيرُ", en: "There is nothing like unto Him, and He is the All-Hearing, the All-Seeing.", ref: "Quran 42:11" },
    hadith: { ar: "إِنَّ لِلَّهِ تِسْعَةً وَتِسْعِينَ اسْمًا مَنْ أَحْصَاهَا دَخَلَ الْجَنَّةَ", en: "Allah has 99 names. Whoever encompasses them will enter Paradise.", source: "Sahih al-Bukhari 2736 · Abu Hurayrah رضي الله عنه" },
    explanation: `Four errors to avoid regarding Allah's attributes:\n1. TA'TEEL (denial): Saying "Allah has no hand, no face" despite the Quran's clear statements.\n2. TAHRIF (distortion): Re-interpreting "hand" as "power" without evidence.\n3. TAMTHEEL (comparison): Saying "Allah's hand is like a human hand."\n4. TAKYEEF (asking how): Speculating on the exact nature of Allah's attributes.\n\nIMAM MALIK'S GOLD STANDARD: Asked about Allah's rising over the Throne (istiwa — 20:5), he said: "Al-istiwa is known, the HOW is unknown, believing in it is obligatory, and asking about it is an innovation." This single answer contains the entire methodology.\n\nLIVE EXAMPLE: When you say in du'a "Ya Allah, You are as-Sami' (All-Hearing)" — you affirm that Allah truly hears, with a Hearing that befits His Majesty, unlike any hearing of creation. You are not speaking into a void. You are calling on a Lord who actually, truly, literally hears you right now — more clearly than anyone ever has.`
  },
  {
    module: "Tawheed al-Asmaa' — Al-Hayy al-Qayyum",
    moduleBg: "#f3e5f5", moduleBadge: "#6b21a8", moduleBorder: "#ce93d8",
    titleEn: "Al-Hayy al-Qayyum — The Greatest Name",
    titleAr: "الحَيُّ القَيُّومُ — اسمُ اللَّهِ الأَعظَمُ",
    subtitleEn: "The Ever-Living, Self-Sustaining — why Ayat al-Kursi is the greatest verse",
    quranicProof: { ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ", en: "Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep.", ref: "Quran 2:255 — Ayat al-Kursi" },
    hadith: { ar: "مَنْ قَرَأَ آيَةَ الْكُرْسِيِّ فِي دُبُرِ كُلِّ صَلَاةٍ مَكْتُوبَةٍ لَمْ يَمْنَعْهُ مِنْ دُخُولِ الْجَنَّةِ إِلَّا أَنْ يَمُوتَ", en: "Whoever recites Ayat al-Kursi after every obligatory prayer — nothing prevents him from entering Paradise except death.", source: "Ibn Hibban 2005 — Sahih li-ghayrihi" },
    explanation: `Al-Hayy: His life is perfect and eternal. He was never born, will never die, is never tired or distracted. Al-Qayyum: He is completely self-subsistent — everything in existence depends on Him every single moment. Ibn al-Qayyim wrote: "Were Allah to withhold His qayyumiyyah for a single moment, the heavens and earth would vanish instantly."\n\nLIVE EXAMPLE — THE NIGHT: You are alone, afraid. Al-Hayy: He is not asleep — "Neither drowsiness overtakes Him nor sleep." Al-Qayyum: He is not distracted by the billions of people also awake right now — He is fully, completely attentive to YOU. Recite Ayat al-Kursi with understanding, not as a formula.\n\nTHE GREATEST DU'A: Anas ibn Malik narrates the Prophet ﷺ heard a man supplicating using "al-Hayy al-Qayyum" and said: "He has called upon Allah by His Greatest Name (al-ism al-a'zam) — the one by which, if called upon, He responds." (Abu Dawud 1495 · Tirmidhi 3544 — Sahih).\n\nFor anxiety and worry, the Prophet ﷺ prescribed: "Yaa Hayyu Yaa Qayyoom — bi-rahmatika astaghith. Aslih li sha'ni kullahu wa laa takilni ilaa nafsi tarfata 'ayn." (Hakim 1/730 — Sahih).`
  },
  {
    module: "Tawheed — Tawakkul",
    moduleBg: "#fff8e1", moduleBadge: "#b7791f", moduleBorder: "#ffe082",
    titleEn: "Tawakkul — Complete Reliance on Allah",
    titleAr: "التَّوَكُّلُ عَلَى اللَّهِ حَقَّ تَوَكُّلِهِ",
    subtitleEn: "True tawakkul combines full effort with complete trust — neither passivity nor self-reliance",
    quranicProof: { ar: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ۚ إِنَّ اللَّهَ بَالِغُ أَمْرِهِ", en: "And whoever relies upon Allah — then He is sufficient for him. Indeed, Allah will accomplish His purpose.", ref: "Quran 65:3" },
    hadith: { ar: "لَوْ أَنَّكُمْ كُنْتُمْ تَوَكَّلُونَ عَلَى اللَّهِ حَقَّ تَوَكُّلِهِ لَرُزِقْتُمْ كَمَا يُرْزَقُ الطَّيْرُ، تَغْدُو خِمَاصًا وَتَرُوحُ بِطَانًا", en: "If you relied upon Allah with true reliance, He would provide for you as He provides for the birds — they go out hungry and return full.", source: "Jami' al-Tirmidhi 2344 — Umar ibn al-Khattab رضي الله عنه · Sahih" },
    explanation: `Tawakkul is NOT sitting home making no effort while saying "Allah will provide." When the Prophet ﷺ described the birds, notice: THEY GO OUT. They leave. They search. They expend effort. But their reliance is on Allah's provision, not their own wings.\n\nLIVE EXAMPLE: A student at Tahleem has exams. Tawakkul means: study to their maximum, attend every class, review notes AND pray two rak'ahs before sitting, make sincere du'a. When the result comes — pass or fail — say: "This is what Allah decreed, and He knows better than I do."\n\nWhat is NOT tawakkul: skipping study because "Allah will help me." The Prophet ﷺ told the man who left his camel untied: "Tie it and THEN put your trust in Allah." (Tirmidhi 2517).\n\nLIVE EXAMPLE 2: Ibrahim (AS) was thrown into a fire. Jibreel AS offered help. Ibrahim AS said: "From you, no. But from Allah — yes." Allah said: "O fire — be cool and safe for Ibrahim." (21:69). No means could have solved that problem. Tawakkul unlocked what no plan could.`
  },
  {
    module: "Al-Usul al-Thalatha",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "The Three Grave Questions — Man Rabbuk?",
    titleAr: "الأُصُولُ الثَّلاثَةُ — مَن رَبُّك؟",
    subtitleEn: "Every soul will be asked three questions in the grave — Sheikh Ibn Abd al-Wahhab",
    quranicProof: { ar: "يُثَبِّتُ اللَّهُ الَّذِينَ آمَنُوا بِالْقَوْلِ الثَّابِتِ فِي الْحَيَاةِ الدُّنْيَا وَفِي الْآخِرَةِ", en: "Allah keeps firm those who believe with the firm word in worldly life and in the Hereafter.", ref: "Quran 14:27" },
    hadith: { ar: "إِنَّ الْمَيِّتَ إِذَا وُضِعَ فِي قَبْرِهِ يَأْتِيهِ مَلَكَانِ فَيَقُولَانِ: مَنْ رَبُّكَ؟ مَا دِينُكَ؟ مَنْ نَبِيُّكَ؟", en: "When the deceased is placed in his grave, two angels come and say: Who is your Lord? What is your religion? Who is your Prophet?", source: "Musnad Ahmad 18534 — Abu Hurayrah رضي الله عنه · Sahih" },
    explanation: `Sheikh Muhammad ibn Abd al-Wahhab رحمه الله structured Al-Usul al-Thalatha around these three grave questions:\n\nFIRST — "Man Rabbuk?" Who is your Lord? Answer: My Lord is Allah. He created me, provided for me, and I worship none but Him. This requires KNOWING Allah through His names, attributes, and acts — not just saying the word.\n\nSECOND — "Ma deenuk?" What is your religion? Answer: Islam — submission to Allah with tawheed, compliance through obedience, and disavowal of shirk. Not a passport category — a complete way of life.\n\nTHIRD — "Man nabiyyuk?" Who is your Prophet? Answer: Muhammad ﷺ. This requires KNOWING him — his life, seerah, sunnah, and character.\n\nLIVE EXAMPLE: The scholars say the only preparation for these questions is LIVING them in dunya. If you lived as though Allah is your Lord — praying to Him, obeying Him, fearing Him — the answer will come with thabat (firmness). The munafiq will say: "Ha ha ha — I don't know! I heard people saying something and I said it." (Bukhari 1374). The du'a for the deceased AND for yourself: "Allahumma thabbithu" — O Allah, keep him/me firm.`
  },
  {
    module: "Al-Usul al-Thalatha — Four Obligations",
    moduleBg: "#e3f2fd", moduleBadge: "#1565c0", moduleBorder: "#90caf9",
    titleEn: "Knowledge · Action · Da'wah · Patience",
    titleAr: "العِلمُ والعَمَلُ والدَّعوَةُ والصَّبرُ",
    subtitleEn: "The four obligations derived from Surah al-Asr — the program of salvation",
    quranicProof: { ar: "وَالْعَصْرِ ۙ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ ۙ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ", en: "By time — indeed mankind is in loss — except those who believe, do righteous deeds, enjoin truth, and enjoin patience upon each other.", ref: "Quran 103:1-3" },
    hadith: { ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ", en: "Seeking knowledge is an obligation upon every Muslim.", source: "Ibn Majah 224 — Anas ibn Malik رضي الله عنه · Sahih" },
    explanation: `Imam al-Shafi'i رحمه الله said: "If Allah had revealed no proof except Surah al-Asr, it would have been sufficient." Sheikh Ibn Abd al-Wahhab رحمه الله derives four obligations from it:\n\n1. KNOWLEDGE (ilm) — corresponds to "those who believe" — Iman cannot be sound without knowledge.\n2. ACTION (amal) — "do righteous deeds" — knowledge without action is proof AGAINST you, not for you.\n3. DA'WAH — "enjoin truth" — knowledge and action create an obligation to share.\n4. SABR — "enjoin patience" — because knowledge, action, and da'wah will bring harm from the world.\n\nLIVE EXAMPLE: A student learns that something is haram. The four-step obligation: (1) Verify from evidence. (2) Act on it — the knowledge obligates you first. (3) Share it with others when appropriate — gently, not publicly shaming. (4) Be patient when friends mock or culture pushes back. This four-step framework applies to EVERY piece of Islamic knowledge you acquire.\n\nEnrolling in Tahleem Academy is step one — ilm. But the purpose is the full four. "Allah will raise those who have believed among you and those who were given knowledge by degrees." (58:11).`
  },
  {
    module: "Nawaqid al-Islam — Introduction",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "What Nullifies Islam — Overview",
    titleAr: "نَوَاقِضُ الإِسْلَامِ — المُقَدِّمَةُ",
    subtitleEn: "Ten nullifiers that break the covenant — for protective awareness, not to create fear",
    quranicProof: { ar: "وَلَقَدْ أُوحِيَ إِلَيْكَ وَإِلَى الَّذِينَ مِن قَبْلِكَ لَئِنْ أَشْرَكْتَ لَيَحْبَطَنَّ عَمَلُكَ", en: "And it has already been revealed to you and to those before you: if you associate anything with Allah, your work would surely become worthless.", ref: "Quran 39:65" },
    hadith: { ar: "بُنِيَ الإِسْلامُ عَلَى خَمْسٍ", en: "Islam was built on five — and those who undermine the foundations undermine the structure.", source: "Sahih al-Bukhari 8 · Sahih Muslim 16" },
    explanation: `Sheikh Muhammad ibn Abd al-Wahhab رحمه الله compiled the ten greatest nullifiers of Islam. He wrote it not to make Muslims paranoid — but because the biggest threat to a believing heart is internal deviation a person may not recognise.\n\nNullifiers divide into:\n- HEART (al-i'tiqad) — wrong beliefs\n- TONGUE (al-qawl) — speech that constitutes kufr\n- ACTION (al-amal) — deeds that nullify Islam\n\nIMPORTANT PRINCIPLE: A nullifier requires CONDITIONS before being applied to any individual: (1) Knowledge — they knew it was haram. (2) Intention — they chose it deliberately. (3) No coercion — they were not forced. (4) No valid scholarly interpretation. This protects against the dangerous error of rashly declaring Muslims as non-Muslims (takfir).\n\nKEY POINT: "Allah overlooks errors, forgetfulness, and what people are compelled to do." (Ibn Majah 2045 — Sahih). Knowledge of the Nawaqid creates vigilance, not terror. Study them to protect your own faith first.`
  },
  {
    module: "Nawaqid al-Islam — Nullifier 1",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Shirk with Allah in His Worship",
    titleAr: "الشِّرْكُ بِاللَّهِ — النَّاقِضُ الأَوَّلُ",
    subtitleEn: "The first and greatest nullifier — dedicating any act of worship to other than Allah",
    quranicProof: { ar: "إِنَّهُ مَن يُشْرِكْ بِاللَّهِ فَقَدْ حَرَّمَ اللَّهُ عَلَيْهِ الْجَنَّةَ وَمَأْوَاهُ النَّارُ", en: "Indeed, he who associates others with Allah — Allah has forbidden him Paradise, and his refuge is the Fire.", ref: "Quran 5:72" },
    hadith: { ar: "لَعَنَ اللَّهُ مَنْ ذَبَحَ لِغَيْرِ اللَّهِ", en: "Allah curses the one who slaughters for other than Allah.", source: "Sahih Muslim 1978 — Ali ibn Abi Talib رضي الله عنه" },
    explanation: `Shirk in worship means: slaughtering for other than Allah; prostrating to other than Allah; making vows (nadhr) to other than Allah; fearing something other than Allah in a way that governs one's actions more than fear of Allah.\n\nLIVE EXAMPLE — SLAUGHTER: In parts of the Muslim world, an animal is slaughtered "for the wali" of a local shrine when someone is ill. This is exactly what the Prophet ﷺ condemned. The replacement: "Allahumma hadhihi minka wa laka" — O Allah, this is from You and for You. Slaughter for Allah. Give the meat to the poor.\n\nLIVE EXAMPLE 2 — VOWS: "I vow to give 100 kg of rice to the shrine of X if my son recovers." This is a vow to other than Allah. Correct form: "Ya Allah, if You cure my son, I will give 100 kg of rice to the poor as sadaqah." The sadaqah outcome is identical. But the direction of the vow is entirely different — and that direction is everything.\n\nLIVE EXAMPLE 3 — TALISMAN: Wearing an amulet believing it independently protects from harm. "Whoever wears a tameemah has committed shirk." (Ahmad 16951 — Sahih). The cure: Ayat al-Kursi, the Mu'awwidhat — protection by Allah's permission, not intrinsic power.`
  },
  {
    module: "Nawaqid al-Islam — Nullifiers 2–5",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Intermediaries · Doubting Shirk · Hating the Deen",
    titleAr: "الوَاسِطَةُ — الشَّكُّ — بُغضُ الدِّينِ",
    subtitleEn: "Nullifiers two through five — each a complete break from the covenant of faith",
    quranicProof: { ar: "وَالَّذِينَ اتَّخَذُوا مِن دُونِهِ أَوْلِيَاءَ مَا نَعْبُدُهُمْ إِلَّا لِيُقَرِّبُونَا إِلَى اللَّهِ زُلْفَىٰ", en: "Those who take protectors besides Him say: We only worship them so that they may bring us closer to Allah.", ref: "Quran 39:3" },
    hadith: { ar: "مَنْ أَتَى كَاهِنًا أَوْ عَرَّافًا فَصَدَّقَهُ بِمَا يَقُولُ فَقَدْ كَفَرَ بِمَا أُنزِلَ عَلَى مُحَمَّدٍ", en: "Whoever goes to a fortune-teller and believes what he says has disbelieved in what was revealed to Muhammad.", source: "Abu Dawud 3904 — Abu Hurayrah رضي الله عنه · Sahih" },
    explanation: `NULLIFIER 2 — INTERMEDIARIES: Setting up go-betweens between oneself and Allah — making du'a through saints, asking the dead to intercede directly. This was the justification of the Qurayshi mushrikeen: "We only worship them so they may bring us closer to Allah." (39:3). Allah rejected this completely.\n\nPERMITTED intercession: Asking a LIVING person to make du'a FOR you. Visiting a living scholar and saying "please make du'a for me" is fine. Calling on the dead at graves is not.\n\nNULLIFIER 3 — NOT DECLARING SHIRK AS SHIRK: Saying "Judaism, Christianity, and Islam are all valid paths to God." The correct position: We respect all people, acknowledge prophets came to them, AND affirm: "Whoever seeks other than Islam as a religion — it will never be accepted from him." (3:85). Politeness is not the same as theological relativism.\n\nNULLIFIER 4 — BELIEVING ANOTHER GUIDANCE IS MORE COMPLETE: "Secular law is more just than Islamic governance for this era." If believed sincerely, this contradicts "Today I have perfected your religion for you." (5:3).\n\nNULLIFIER 5 — HATING WHAT THE PROPHET ﷺ CAME WITH: Internally hating any of Allah's commands — even while outwardly practising them. The cure: "Ya Allah, make the prayer beloved to me as it was beloved to Your Prophet ﷺ."`
  },
  {
    module: "Nawaqid al-Islam — Nullifiers 6–10",
    moduleBg: "#fce4ec", moduleBadge: "#c62828", moduleBorder: "#ef9a9a",
    titleEn: "Magic · Mocking · Apostasy · Alliance · Turning Away",
    titleAr: "السِّحرُ — الاستِهزَاءُ — الرِّدَّةُ",
    subtitleEn: "The final five nullifiers — and modern traps to be aware of",
    quranicProof: { ar: "قُلْ أَبِاللَّهِ وَآيَاتِهِ وَرَسُولِهِ كُنتُمْ تَسْتَهْزِئُونَ ۙ لَا تَعْتَذِرُوا قَدْ كَفَرْتُم بَعْدَ إِيمَانِكُمْ", en: "Say: Was it Allah, His verses, and His Messenger you were mocking? Make no excuse — you have disbelieved after your faith.", ref: "Quran 9:65-66" },
    hadith: { ar: "مَنْ تَعَلَّمَ السِّحْرَ قَلِيلًا أَوْ كَثِيرًا كَانَ آخِرُ عَهْدِهِ بِجِبْرِيلَ", en: "Whoever learns magic — little or much — his connection with Jibreel is severed.", source: "Al-Tabarani — Ibn Mas'ud رضي الله عنه · Sahih li-ghayrihi" },
    explanation: `NULLIFIER 6 — MAGIC: Practising or seeking sihr that involves calling on jinn or satanic rites — hiring a "shaykh" for sihr on someone's spouse or enemy. Haram to USE and haram to SEEK. Protection: Surah al-Baqarah in the home daily, morning/evening adhkar, Ayat al-Kursi.\n\nNULLIFIER 7 — SUPPORTING KUFFAR AGAINST MUSLIMS: Genuinely allying with polytheists to fight and harm Muslims. This is not about living in a non-Muslim country or having non-Muslim colleagues — it is about actively working against Muslims.\n\nNULLIFIER 8 — APOSTASY: Voluntarily and knowingly declaring one has left Islam.\n\nNULLIFIER 9 — MOCKING THE DEEN: Joking that salah is "just bowing," that hijab is "backward," that halal/haram is "superstition" — if said with genuine mockery and not mere frustration. The Quran is direct: "Make no excuse — you have disbelieved after your faith." (9:66).\n\nLIVE EXAMPLE — SOCIAL MEDIA: A Muslim tweets "The hijab command is medieval — no god would care about a piece of cloth." If said with genuine rejection of the command's validity, this touches nullifier 9. Check your tongue — especially online — before speaking about Allah's commands with contempt.\n\nNULLIFIER 10 — TURNING AWAY: Deliberate, complete rejection of Islam — refusing to learn or practise out of wilful rejection (not ignorance).`
  },
  {
    module: "Al-Qawa'id al-Arba' — Principle 1",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "Even Mushrikeen Acknowledged Allah as Creator",
    titleAr: "إِقرَارُ المُشرِكِينَ بِالرُّبُوبِيَّةِ",
    subtitleEn: "The battle of Tawheed is in Uluhiyyah — not in acknowledging a Creator",
    quranicProof: { ar: "وَلَئِن سَأَلْتَهُم مَّنْ خَلَقَ السَّمَاوَاتِ وَالْأَرْضَ وَسَخَّرَ الشَّمْسَ وَالْقَمَرَ لَيَقُولُنَّ اللَّهُ", en: "And if you asked them who created the heavens and earth and subjected the sun and moon — they would surely say: Allah.", ref: "Quran 29:61" },
    hadith: { ar: "كُلُّ مَولُودٍ يُولَدُ عَلَى الفِطرَةِ، فَأَبَوَاهُ يُهَوِّدَانِهِ أَو يُنَصِّرَانِهِ أَو يُمَجِّسَانِهِ", en: "Every child is born upon the fitrah. It is his parents who make him a Jew, a Christian, or a Zoroastrian.", source: "Sahih al-Bukhari 1358 — Abu Hurayrah رضي الله عنه" },
    explanation: `Principle One of Al-Qawa'id al-Arba' (Sheikh Muhammad ibn Abd al-Wahhab رحمه الله): The mushrikeen of Makkah — those the Prophet ﷺ fought for 23 years — fully acknowledged Allah as Creator and Sustainer. This acknowledgement ALONE did not make them Muslims, did not protect them from the ruling of shirk, and did not earn them paradise.\n\nPROFOUND IMPLICATION: Every human is born with fitrah — an innate recognition of a Creator. Even atheists in genuine crisis often instinctively cry out to a Creator. This is not Islam. Islam requires DIRECTING all worship — prayer, slaughter, vows, fear, hope, love — exclusively to Allah.\n\nLIVE EXAMPLE: A successful businessperson credits "the universe," "good karma," or "their ancestors" alongside Allah. Their acknowledgement of Allah is Rububiyyah-level. But "the universe" has become a partner in their gratitude. The correction: "Masha'Allah, alhamdulillah" — attributing success fully and exclusively to Allah.\n\nLIVE EXAMPLE 2: "All religions worship the same God." First Principle of Al-Qawa'id answers this: Even Qurayshi idol-worshippers "worshipped the same God" in the Rububiyyah sense. The difference — the one that matters — is in Uluhiyyah: is that God worshipped alone, or alongside others?`
  },
  {
    module: "Al-Qawa'id al-Arba' — Principles 2–4",
    moduleBg: "#e8eaf6", moduleBadge: "#283593", moduleBorder: "#9fa8da",
    titleEn: "Mushrikeen Claimed Idols as Intermediaries — and Were Worse in Crisis",
    titleAr: "الوَاسِطَةُ والتَّقَرُّبُ — والأَشَدُّ شِركًا",
    subtitleEn: "Their justification was 'closeness to Allah' — and they called on idols even drowning",
    quranicProof: { ar: "فَإِذَا رَكِبُوا فِي الْفُلْكِ دَعَوُا اللَّهَ مُخْلِصِينَ لَهُ الدِّينَ فَلَمَّا نَجَّاهُمْ إِلَى الْبَرِّ إِذَا هُمْ يُشْرِكُونَ", en: "When they board a ship, they supplicate Allah sincerely. But when He delivers them to land — at once they associate others with Him.", ref: "Quran 29:65" },
    hadith: { ar: "لَا تَقُولُوا: مَا شَاءَ اللَّهُ وَشَاءَ فُلَانٌ، وَلَكِنْ قُولُوا: مَا شَاءَ اللَّهُ ثُمَّ شَاءَ فُلَانٌ", en: "Do not say: What Allah wills AND what so-and-so wills. But say: What Allah wills, THEN what so-and-so wills.", source: "Abu Dawud 4980 — Hudhayfah ibn al-Yaman رضي الله عنه · Sahih" },
    explanation: `PRINCIPLE 2: The mushrikeen did not worship idols believing them to be creators. They believed the idols would INTERCEDE and bring them CLOSER to Allah — "We only worship them so that they may bring us closer to Allah." (39:3). This is the most sophisticated and most common form of shirk — because it sounds pious.\n\nPRINCIPLE 3: They practised MANY types of worship toward their idols — tawaf around them, slaughter for them, vows to them, fear of them, hope in them. Contemporary shirk practices mirror the Qurayshi practices almost exactly.\n\nPRINCIPLE 4 — THE MOST STRIKING: The Quraysh, in genuine danger at sea, reverted to sincere du'a to Allah alone, dropping all idols. "When harm touches you at sea, those you call upon disappear except for Him." (17:67). Sheikh Ibn Abd al-Wahhab's point: many contemporary practitioners call upon their saints EVEN in crisis — drowning, dying — when the fitrah should be screaming "call on Allah."\n\nLIVE EXAMPLE: A fisherman caught in a storm cries: "Ya Shaykh, save us!" — calling on a dead saint at the very moment the Qurayshi mushrik would have cried "Ya Allah!" This is deeper, more entrenched shirk than even the Quraysh.\n\nLANGUAGE: Saying "What Allah AND so-and-so wills" — equating human will with divine will — is corrected to "what Allah wills, THEN what so-and-so wills." Precision of language reflects precision of Tawheed in the heart.`
  },
  {
    module: "Protecting Tawheed Today",
    moduleBg: "#e8f5e9", moduleBadge: "#2e7d32", moduleBorder: "#a5d6a7",
    titleEn: "Protecting Tawheed in Modern Life",
    titleAr: "حِمَايَةُ التَّوحِيدِ فِي الحَيَاةِ المُعَاصِرَةِ",
    subtitleEn: "The five greatest threats to correct creed in the 21st century — and their remedies",
    quranicProof: { ar: "يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ حَقَّ تُقَاتِهِ وَلَا تَمُوتُنَّ إِلَّا وَأَنتُم مُّسْلِمُونَ", en: "O you who believe — fear Allah as He should be feared and do not die except as Muslims.", ref: "Quran 3:102" },
    hadith: { ar: "عَجَبًا لِأَمْرِ الْمُؤْمِنِ، إِنَّ أَمْرَهُ كُلَّهُ خَيْرٌ", en: "Amazing is the affair of the believer — all of it is good. If good comes, he is grateful. If hardship comes, he is patient. And this belongs to no one except the believer.", source: "Sahih Muslim 2999 — Suhaib al-Rumi رضي الله عنه" },
    explanation: `THREAT 1 — SPIRITUAL MATERIALISM: Treating du'a as a vending machine and Allah as a means to worldly ends. Sign: you call on Allah only when you need something. Remedy: establish daily dhikr purely about knowing Allah — regardless of whether you want anything.\n\nTHREAT 2 — DIGITAL RIYA': Performing worship for an online audience. Remedy: establish a secret 'ibadah practice — a nightly du'a, a hidden sadaqah, a private Quran recitation no one knows about. What is hidden from people but known to Allah is the most sincere.\n\nTHREAT 3 — CULTURAL SHIRK: Practices inherited from culture — shrine visits for requests, taweez, horoscopes (still fortune-telling). Remedy: evaluate every practice: "Is this directed solely to Allah? Is it from Quran and Sunnah?"\n\nTHREAT 4 — THEOLOGICAL RELATIVISM: Social media pressure to say "all religions are the same." Remedy: Al-Qawa'id al-Arba', Principle One. Even Qurayshi idol-worshippers acknowledged "the same God." What makes Islam Islam is exclusive Uluhiyyah.\n\nTHREAT 5 — DELAYED REPENTANCE: "I'll fix my deen later." The Prophet ﷺ said: "Take advantage of five before five — your youth before old age, your health before illness, your wealth before poverty, your free time before occupation, and your life before death." (Hakim — Sahih). Tawheed begins today.`
  },
];
interface Props { language?: string; }

// ── Static curated Islamic news — shown when live fetch fails (CORS/mobile) ──
export const STATIC_NEWS: NewsItem[] = [
  {
    title: "The Importance of Seeking Knowledge in Islam",
    link: "https://islamqa.info/en/answers/10471/the-importance-of-seeking-knowledge",
    description: "Islam places great emphasis on education and the pursuit of knowledge for both men and women. The Prophet ﷺ said: 'Seeking knowledge is an obligation upon every Muslim.'",
    thumbnail: "",
    pubDate: new Date().toISOString(),
  },
  {
    title: "Understanding Tawakkul: True Reliance on Allah",
    link: "https://productivemuslim.com/tawakkul/",
    description: "Tawakkul means placing complete trust in Allah while taking all the necessary means and actions. It is not passivity, but active engagement paired with sincere reliance.",
    thumbnail: "",
    pubDate: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    title: "The Virtues of Dhikr and Remembrance of Allah",
    link: "https://islamqa.info/en/answers/9917",
    description: "Allah says: 'Verily, in the remembrance of Allah do hearts find rest.' (13:28). Regular dhikr keeps the heart alive and connected to its Creator.",
    thumbnail: "",
    pubDate: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    title: "How to Make the Most of Your Time as a Muslim Student",
    link: "https://productivemuslim.com/time-management-students/",
    description: "Time is one of the greatest blessings Allah has given us. Learning to manage it well — balancing worship, study, and rest — is itself an act of gratitude.",
    thumbnail: "",
    pubDate: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    title: "The Role of Patience (Sabr) in a Muslim's Life",
    link: "https://islamqa.info/en/answers/9427",
    description: "The Quran mentions sabr over 90 times. Allah is with the patient: 'Indeed, Allah is with the patient.' (2:153). Sabr covers patience in obedience, from sin, and with trials.",
    thumbnail: "",
    pubDate: new Date(Date.now() - 345600000).toISOString(),
  },
];
/*  src/components/dashboard/IslamicDailyFeed.tsx
    Islamic Daily Feed — Component (UI only)
    Data constants and types live in IslamicDailyFeed.data.ts
*/
import { useState, useEffect } from "react";
import { BookMarked, ScrollText, CalendarDays, Newspaper, ExternalLink, RefreshCw, Star, ChevronDown, ChevronUp, Shield } from "lucide-react";
import {
  DARK_GREEN, MID_GREEN, GOLD, GOLD_LIGHT,
  TEXT_DARK, TEXT_MED, TEXT_LIGHT, BORDER,
  AMBER, AMBER_BG,
  dayOfYear, getHijriNumeric,
  FALLBACK_HADITHS, SEERAH, ISLAMIC_EVENTS, TAWHEED_LESSONS, STATIC_NEWS,
  type LiveHadith, type NewsItem, type TabId, type TawheedLesson,
} from "./IslamicDailyFeed.data";

interface Props { language?: string; }

const IslamicDailyFeed: React.FC<Props> = ({ language = "en" }) => {
  const doy   = dayOfYear();
  const today = new Date();

  const fallbackHadith = FALLBACK_HADITHS[doy % FALLBACK_HADITHS.length];
  const dailySeerah    = SEERAH[doy % SEERAH.length];

  const upcomingEvent = (() => {
    for (let i = 0; i < 14; i++) {
      const check       = new Date(today.getTime() + i * 86_400_000);
      const { day, month } = getHijriNumeric(check);
      const ev = ISLAMIC_EVENTS.find(e =>
        e.hijriMonth === month && Math.abs(e.hijriDay - day) <= (e.daysWindow ?? 3)
      );
      if (ev) return { event: ev, daysAway: i };
    }
    return { event: ISLAMIC_EVENTS[doy % ISLAMIC_EVENTS.length], daysAway: -1 };
  })();

  const [activeTab,  setActiveTab]  = useState<TabId>("hadith");
  const [liveHadith, setLiveHadith] = useState<LiveHadith | null>(null);
  const [hadithLoad, setHadithLoad] = useState(true);
  const [news,       setNews]       = useState<NewsItem[]>([]);
  const [newsLoad,   setNewsLoad]   = useState(false);
  const [newsError,  setNewsError]  = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [twExp,      setTwExp]      = useState(false);

  // Spotlight imminent events
  useEffect(() => {
    if (upcomingEvent.daysAway === 0 || upcomingEvent.daysAway === 1) setActiveTab("event");
  }, []);

  useEffect(() => { setExpanded(false); setTwExp(false); }, [activeTab]);

  // Fetch live hadith from HadeethEnc (free Islamic API)
  useEffect(() => {
    setHadithLoad(true);
    fetch("https://hadeethenc.com/api/v1/hadeeths/random/?language=en")
      .then(r => r.json())
      .then(d => {
        if (d && d.hadeeth) {
          setLiveHadith({
            ar:          d.arabic    || fallbackHadith.ar,
            en:          d.hadeeth,
            source:      d.attribution || fallbackHadith.source,
            narrator:    d.attribution || fallbackHadith.narrator,
            grade:       d.grade       || "Authenticated",
            explanation: d.explanation || fallbackHadith.explanation,
          });
        }
      })
      .catch(() => {})
      .finally(() => setHadithLoad(false));
  }, []);

  // Fetch Islamic news — try rss2json proxy, fall back to static curated news
  useEffect(() => {
    if (activeTab !== "news" || news.length > 0 || newsLoad) return;
    setNewsLoad(true);
    setNewsError(false);

    const RSS_FEEDS = [
      "https://muslimmatters.org/feed/",
      "https://productivemuslim.com/feed/",
      "https://aboutislam.net/feed/",
    ];

    (async () => {
      for (const feed of RSS_FEEDS) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&count=5`;
          const r   = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (!r.ok) continue;
          const d = await r.json();
          if (d.status === "ok" && d.items?.length > 0) {
            setNews(d.items.map((it: any) => ({
              title:       (it.title  || "").replace(/&#\d+;/g, "").replace(/&amp;/g, "&").trim(),
              link:        it.link    || "#",
              description: (it.description || "").replace(/<[^>]*>/g, "").slice(0, 140).trim() + "…",
              thumbnail:   it.thumbnail || it.enclosure?.link || "",
              pubDate:     it.pubDate || "",
            })));
            setNewsLoad(false);
            return;
          }
        } catch { /* timeout or CORS — try next */ }
      }
      // All feeds failed (CORS on mobile is common) — show curated static news
      // so the tab is never empty or broken.
      setNews(STATIC_NEWS);
      setNewsLoad(false);
      // Don't set newsError — the static news is useful content, not an error state
    })();
  }, [activeTab]);

  const t = (en: string, ar: string) => language === "ar" ? ar : en;

  const relDate = (s: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
      if (diff === 0) return "Today";
      if (diff === 1) return "Yesterday";
      return `${diff}d ago`;
    } catch { return ""; }
  };

  const hadith = liveHadith ?? fallbackHadith;

  const TABS: { id: TabId; en: string; ar: string; Icon: any; color: string }[] = [
    { id: "hadith", en: "Hadith",  ar: "حديث",   Icon: BookMarked,   color: DARK_GREEN },
    { id: "seerah", en: "Seerah",  ar: "سيرة",   Icon: ScrollText,   color: AMBER },
    { id: "event",  en: "Events",  ar: "مناسبة", Icon: CalendarDays, color: MID_GREEN },
    { id: "news",   en: "News",    ar: "أخبار",  Icon: Newspaper,    color: "#1e3a5f" },
    { id: "tawheed", en: "Tawheed", ar: "توحيد",  Icon: Shield,       color: "#6b21a8" },
  ];

  const outerCard: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    boxShadow: "0 2px 16px rgba(0,0,0,.06)",
    overflow: "hidden",
  };

  return (
    <div>
      {/* Section label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Star style={{ width: 14, height: 14, color: GOLD, fill: GOLD }} />
        <span style={{ fontSize: 15, fontWeight: 900, color: TEXT_DARK, fontFamily: "'Playfair Display', serif" }}>
          {t("Islamic Daily", "يوميتك الإسلامية")}
        </span>
        <Star style={{ width: 14, height: 14, color: GOLD, fill: GOLD }} />
      </div>

      <div style={outerCard}>

        {/* Tab strip */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
          {TABS.map(({ id, en, ar, Icon, color }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex: 1, padding: "12px 4px", border: "none", cursor: "pointer",
                background: active ? "#fff" : "transparent",
                borderBottom: active ? `2.5px solid ${color}` : "2.5px solid transparent",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all .15s",
              }}>
                <Icon style={{ width: 16, height: 16, color: active ? color : TEXT_LIGHT }} />
                <span style={{ fontSize: 10, fontWeight: active ? 800 : 500, color: active ? color : TEXT_LIGHT }}>
                  {t(en, ar)}
                </span>
              </button>
            );
          })}
        </div>

        {/* ══ HADITH TAB ══════════════════════════════════════════════════ */}
        {activeTab === "hadith" && (
          <div>
            <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 100%)`, padding: "22px 20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <BookMarked style={{ width: 13, height: 13, color: GOLD }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.06em", fontFamily: "'Playfair Display', serif" }}>
                    {t("Hadith of the Day", "حديث اليوم")}
                  </span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: "3px 9px" }}>
                  {hadith.grade}
                </span>
              </div>

              {hadithLoad ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: GOLD, animation: "idf-spin .7s linear infinite", margin: "0 auto 8px" }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{t("Loading hadith…", "جاري التحميل…")}</span>
                  <style>{`@keyframes idf-spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <>
                  {hadith.ar && (
                    <p style={{ fontFamily: "'Scheherazade New','Amiri Quran','Amiri',serif", fontSize: 21, lineHeight: 2.0, color: "#fff", textAlign: "center", direction: "rtl", margin: "0 0 14px", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                      {hadith.ar}
                    </p>
                  )}
                  <div style={{ width: 40, height: 1.5, background: GOLD, margin: "0 auto 14px", borderRadius: 2, opacity: 0.8 }} />
                  <p style={{ fontSize: 13, lineHeight: 1.75, fontStyle: "italic", color: "rgba(255,255,255,0.9)", textAlign: "center", margin: "0 0 14px" }}>
                    "{hadith.en}"
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: GOLD_LIGHT }}>{hadith.source}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                      {t("Narrated by", "عن")} {hadith.narrator}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Explanation */}
            {!hadithLoad && hadith.explanation && (
              <div style={{ padding: "16px 20px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <div style={{ width: 3, height: 16, background: GOLD, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: TEXT_MED, fontFamily: "'Playfair Display', serif" }}>
                    {t("Explanation & Evidence", "الشرح والأدلة")}
                  </span>
                </div>
                <p style={{
                  fontSize: 12.5, lineHeight: 1.85, color: TEXT_DARK, margin: "0 0 8px",
                  display: "-webkit-box", WebkitLineClamp: expanded ? 999 : 4,
                  WebkitBoxOrient: "vertical", overflow: "hidden",
                } as React.CSSProperties}>
                  {hadith.explanation}
                </p>
                {hadith.explanation.length > 200 && (
                  <button onClick={() => setExpanded(v => !v)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 11, fontWeight: 700, color: MID_GREEN, padding: 0,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {expanded
                      ? <><ChevronUp style={{ width: 13, height: 13 }} />{t("Show less", "أقل")}</>
                      : <><ChevronDown style={{ width: 13, height: 13 }} />{t("Read full explanation", "اقرأ الشرح كاملاً")}</>
                    }
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ SEERAH TAB ══════════════════════════════════════════════════ */}
        {activeTab === "seerah" && (
          <div style={{ background: AMBER_BG }}>
            {/* Header */}
            <div style={{ padding: "18px 20px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <ScrollText style={{ width: 14, height: 14, color: AMBER }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: AMBER, letterSpacing: "0.06em", fontFamily: "'Playfair Display', serif" }}>
                  {t("Daily Seerah", "السيرة النبوية")}
                </span>
                <div style={{ marginLeft: "auto", background: `${AMBER}18`, border: `1px solid ${AMBER}40`, borderRadius: 20, padding: "3px 10px" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: AMBER }}>{dailySeerah.year}</span>
                </div>
              </div>

              {/* Title */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                <div style={{ flexShrink: 0, marginTop: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: AMBER, boxShadow: `0 0 0 3px ${AMBER}33` }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 900, color: TEXT_DARK, margin: "0 0 3px", fontFamily: "'Playfair Display', serif", lineHeight: 1.3 }}>
                    {dailySeerah.title}
                  </h3>
                  <p style={{ fontSize: 12, color: AMBER, margin: 0, fontFamily: "'Scheherazade New','Amiri',serif", direction: "rtl" }}>
                    {dailySeerah.titleAr}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div style={{ marginLeft: 20, marginRight: 20, borderLeft: `2px solid ${AMBER}30`, paddingLeft: 14, paddingBottom: 20 }}>
              <p style={{
                fontSize: 12.5, lineHeight: 1.9, color: "#44200a", margin: "0 0 10px",
                whiteSpace: "pre-line",
                display: expanded ? "block" : "-webkit-box",
                WebkitLineClamp: expanded ? undefined : 6,
                WebkitBoxOrient: "vertical", overflow: expanded ? "visible" : "hidden",
              } as React.CSSProperties}>
                {dailySeerah.content}
              </p>
              <button onClick={() => setExpanded(v => !v)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700, color: AMBER, padding: 0,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {expanded
                  ? <><ChevronUp style={{ width: 13, height: 13 }} />{t("Show less", "أقل")}</>
                  : <><ChevronDown style={{ width: 13, height: 13 }} />{t("Read full story", "اقرأ القصة كاملة")}</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ══ EVENTS TAB ══════════════════════════════════════════════════ */}
        {activeTab === "event" && (() => {
          const { event, daysAway } = upcomingEvent;
          return (
            <div>
              <div style={{ background: `linear-gradient(135deg, ${DARK_GREEN} 0%, #1a5c35 100%)`, padding: "18px 20px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarDays style={{ width: 13, height: 13, color: GOLD }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.05em", fontFamily: "'Playfair Display', serif" }}>
                      {t("Islamic Events", "مناسبة إسلامية")}
                    </span>
                  </div>
                  {daysAway === 0 && <span style={{ fontSize: 9, fontWeight: 800, color: DARK_GREEN, background: GOLD, borderRadius: 20, padding: "3px 10px" }}>{t("TODAY ✨", "اليوم ✨")}</span>}
                  {daysAway === 1 && <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: "rgba(201,168,76,0.18)", border: "1px solid rgba(201,168,76,0.35)", borderRadius: 20, padding: "3px 10px" }}>{t("Tomorrow", "غداً")}</span>}
                  {daysAway > 1 && daysAway < 14 && <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: "rgba(201,168,76,0.14)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 20, padding: "3px 10px" }}>{t(`In ${daysAway} days`, `خلال ${daysAway} أيام`)}</span>}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 34, marginBottom: 8 }}>{event.emoji}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 900, color: "#fff", margin: "0 0 6px", fontFamily: "'Playfair Display', serif" }}>{event.name}</h3>
                  <p style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 20, color: GOLD_LIGHT, margin: 0, direction: "rtl", lineHeight: 1.6 }}>{event.nameAr}</p>
                </div>
              </div>
              <div style={{ padding: "18px 20px 20px" }}>
                <p style={{
                  fontSize: 12.5, lineHeight: 1.9, color: TEXT_DARK, margin: "0 0 10px",
                  whiteSpace: "pre-line",
                  display: expanded ? "block" : "-webkit-box",
                  WebkitLineClamp: expanded ? undefined : 5,
                  WebkitBoxOrient: "vertical", overflow: expanded ? "visible" : "hidden",
                } as React.CSSProperties}>
                  {event.writeup}
                </p>
                <button onClick={() => setExpanded(v => !v)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, color: MID_GREEN, padding: 0,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {expanded
                    ? <><ChevronUp style={{ width: 13, height: 13 }} />{t("Show less", "أقل")}</>
                    : <><ChevronDown style={{ width: 13, height: 13 }} />{t("Read full writeup", "اقرأ أكثر")}</>
                  }
                </button>
              </div>
            </div>
          );
        })()}

        {/* ══ NEWS TAB ════════════════════════════════════════════════════ */}
        {activeTab === "news" && (
          <div style={{ padding: "16px 16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Newspaper style={{ width: 13, height: 13, color: "#1e3a5f" }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#1e3a5f", fontFamily: "'Playfair Display', serif" }}>
                  {t("Islamic News", "أخبار إسلامية")}
                </span>
              </div>
              <button onClick={() => { setNewsError(false); setNews([]); }}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: TEXT_MED, padding: 0 }}>
                <RefreshCw style={{ width: 11, height: 11 }} />{t("Refresh", "تحديث")}
              </button>
            </div>

            {newsLoad && (
              <div style={{ padding: "28px 0", textAlign: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${DARK_GREEN}`, borderTopColor: "transparent", animation: "idf-spin .7s linear infinite", margin: "0 auto 10px" }} />
                <span style={{ fontSize: 11, color: TEXT_LIGHT }}>{t("Loading latest Islamic news…", "جاري تحميل الأخبار…")}</span>
              </div>
            )}

            {newsError && !newsLoad && (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: TEXT_LIGHT, margin: "0 0 12px" }}>
                  {t("Could not load news. Please check your internet connection.", "تعذّر تحميل الأخبار. يُرجى التحقق من الاتصال.")}
                </p>
                <button onClick={() => { setNewsError(false); setNews([]); }}
                  style={{ fontSize: 12, fontWeight: 700, color: MID_GREEN, background: "none", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 18px", cursor: "pointer" }}>
                  {t("Try again", "حاول مجدداً")}
                </button>
              </div>
            )}

            {!newsLoad && !newsError && news.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {news.map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 12, padding: "11px 12px", borderRadius: 12, background: "#f8fafc", border: `1px solid ${BORDER}`, alignItems: "flex-start" }}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" style={{ width: 60, height: 60, borderRadius: 9, objectFit: "cover", flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 60, height: 60, borderRadius: 9, background: `${DARK_GREEN}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Newspaper style={{ width: 22, height: 22, color: TEXT_LIGHT }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: TEXT_DARK, margin: "0 0 4px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                          {item.title}
                        </p>
                        <p style={{ fontSize: 11, color: TEXT_LIGHT, margin: "0 0 6px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                          {item.description}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 10, color: TEXT_LIGHT }}>{relDate(item.pubDate)}</span>
                          <ExternalLink style={{ width: 9, height: 9, color: TEXT_LIGHT }} />
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAWHEED TAB ════════════════════════════════════════════════════ */}
        {activeTab === "tawheed" && (() => {
          const twLesson = TAWHEED_LESSONS[doy % TAWHEED_LESSONS.length];
          return (
            <div>
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg, #1e0533 0%, #3b0764 100%)", padding: "18px 20px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield style={{ width: 13, height: 13, color: GOLD }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.06em", fontFamily: "'Playfair Display', serif" }}>
                      {t("Tawheed of the Day", "توحيد اليوم")}
                    </span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#e9d5ff", background: "rgba(233,213,255,0.12)", border: "1px solid rgba(233,213,255,0.2)", borderRadius: 20, padding: "3px 9px" }}>
                    {twLesson.module}
                  </span>
                </div>
                {/* Title */}
                <h3 style={{ fontSize: 15, fontWeight: 900, color: "#fff", margin: "0 0 4px", fontFamily: "'Playfair Display', serif", lineHeight: 1.3 }}>
                  {twLesson.titleEn}
                </h3>
                <p dir="rtl" style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 17, lineHeight: 1.8, color: GOLD_LIGHT, margin: "0 0 6px", textAlign: "center" }}>
                  {twLesson.titleAr}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                  {twLesson.subtitleEn}
                </p>
              </div>

              {/* Quranic Proof */}
              <div style={{ background: "#f0fff4", borderBottom: "1px solid #c6e6c6", padding: "14px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: MID_GREEN, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <span>📖</span> {t("Quranic Proof", "الدليل القرآني")}
                </div>
                <p dir="rtl" style={{ fontFamily: "'Scheherazade New','Amiri Quran','Amiri',serif", fontSize: 20, lineHeight: 2.1, color: DARK_GREEN, textAlign: "center", margin: "0 0 8px" }}>
                  {twLesson.quranicProof.ar}
                </p>
                <p style={{ fontSize: 11, color: "#276749", fontStyle: "italic", textAlign: "center", margin: "0 0 4px", lineHeight: 1.6 }}>
                  "{twLesson.quranicProof.en}"
                </p>
                <p style={{ fontSize: 11, fontWeight: 700, color: GOLD, textAlign: "center", margin: 0 }}>
                  — {twLesson.quranicProof.ref}
                </p>
              </div>

              {/* Hadith */}
              <div style={{ background: AMBER_BG, borderBottom: `1px solid #ffe082`, padding: "14px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: AMBER, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <span>📜</span> {t("Hadith Evidence", "الدليل من السنة")}
                </div>
                <p dir="rtl" style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 16, lineHeight: 2, color: "#5d4037", textAlign: "center", margin: "0 0 6px" }}>
                  {twLesson.hadith.ar}
                </p>
                <p style={{ fontSize: 11, color: "#7a6030", fontStyle: "italic", textAlign: "center", margin: "0 0 3px" }}>
                  "{twLesson.hadith.en}"
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: AMBER, textAlign: "center", margin: 0 }}>
                  — {twLesson.hadith.source}
                </p>
              </div>

              {/* Explanation expand */}
              <div style={{ padding: "12px 20px 16px" }}>
                <button onClick={() => setTwExp(v => !v)} style={{
                  width: "100%", background: twExp ? "#f3e8ff" : "#faf5ff",
                  border: "1px solid #e9d5ff", borderRadius: 10, padding: "10px 14px",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b21a8" }}>
                    {twExp ? t("Hide Explanation & Examples", "إخفاء الشرح") : t("Show Explanation & Live Examples ↓", "عرض الشرح والأمثلة ↓")}
                  </span>
                  {twExp
                    ? <ChevronUp  style={{ width: 14, height: 14, color: "#6b21a8" }} />
                    : <ChevronDown style={{ width: 14, height: 14, color: "#6b21a8" }} />
                  }
                </button>
                {twExp && (
                  <div style={{ marginTop: 10, background: "#faf5ff", borderRadius: 12, border: "1px solid #e9d5ff", padding: "14px 16px" }}>
                    {twLesson.explanation.split("\n\n").map((para: string, i: number) => {
                      const isLive    = para.startsWith("LIVE EXAMPLE");
                      const isKey     = para.startsWith("KEY POINT") || para.startsWith("IMPORTANT") || para.startsWith("THE CURE") || para.startsWith("CONDITIONS") || para.startsWith("PERMITTED");
                      const isNulOrThreat = /^(NULLIFIER|THREAT|PRINCIPLE)/.test(para);
                      return (
                        <p key={i} style={{
                          margin: i === 0 ? 0 : "10px 0 0",
                          fontSize: 12.5, lineHeight: 1.75,
                          color: isLive ? "#0f2d1f" : isKey || isNulOrThreat ? "#92400e" : "#374151",
                          fontWeight: isLive || isKey || isNulOrThreat ? 600 : 400,
                          background: isLive ? "rgba(15,45,31,.04)" : isKey || isNulOrThreat ? "rgba(146,64,14,.04)" : "transparent",
                          borderRadius: 6,
                          borderLeft: isLive ? "3px solid #1a4731" : isKey || isNulOrThreat ? "3px solid #c9a84c" : "none",
                          padding: isLive || isKey || isNulOrThreat ? "6px 6px 6px 10px" : "0",
                        }}>
                          {para}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}


      </div>
    </div>
  );
};

export default IslamicDailyFeed;
