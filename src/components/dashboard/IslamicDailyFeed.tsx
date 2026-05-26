/*  src/components/dashboard/IslamicDailyFeed.tsx
    Islamic Daily Feed — Hadith · Seerah · Events · News
    Tabs rotate daily; news fetched live from RSS.
*/
import { useState, useEffect } from "react";
import { Star, BookMarked, ScrollText, CalendarDays, Newspaper, ExternalLink, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

// ── Color palette (matches StudentDashboard) ──────────────────────────────
const DARK_GREEN = "#0f2d1f";
const MID_GREEN  = "#1a4731";
const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e4c36a";
const CREAM      = "#faf6ee";
const TEXT_DARK  = "#0f2d1f";
const TEXT_MED   = "#4a7c59";
const TEXT_LIGHT = "#7a9e88";
const BORDER     = "rgba(15,45,31,0.1)";
const AMBER      = "#92400e";
const AMBER_BG   = "#fffbeb";

// ── Helpers ───────────────────────────────────────────────────────────────
const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

const getHijriNumeric = (date: Date): { day: number; month: number } => {
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

// ── Hadith Data ───────────────────────────────────────────────────────────
const HADITHS = [
  { ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى", en: "Actions are only by intentions, and every person will have only what they intended.", source: "Sahih al-Bukhari 1", narrator: "Umar ibn al-Khattab رضي الله عنه" },
  { ar: "الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ", en: "A Muslim is one from whose tongue and hand other Muslims are safe.", source: "Sahih al-Bukhari 10", narrator: "Abdullah ibn Amr رضي الله عنه" },
  { ar: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ", en: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Sahih al-Bukhari 13", narrator: "Anas ibn Malik رضي الله عنه" },
  { ar: "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ", en: "Whoever believes in Allah and the Last Day should speak good or remain silent.", source: "Sahih al-Bukhari 6018", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "إِنَّ اللَّهَ لاَ يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ، وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ", en: "Allah does not look at your forms and wealth, but He looks at your hearts and deeds.", source: "Sahih Muslim 2564", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", source: "Sahih al-Bukhari 5027", narrator: "Uthman ibn Affan رضي الله عنه" },
  { ar: "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ", en: "The most beloved deeds to Allah are those done consistently, even if they are few.", source: "Sahih al-Bukhari 6465", narrator: "Aishah رضي الله عنها" },
  { ar: "الدِّينُ النَّصِيحَةُ", en: "The religion is sincere advice and well-wishing.", source: "Sahih Muslim 55", narrator: "Tamim al-Dari رضي الله عنه" },
  { ar: "اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ، وَأَتْبِعِ السَّيِّئَةَ الْحَسَنَةَ تَمْحُهَا، وَخَالِقِ النَّاسَ بِخُلُقٍ حَسَنٍ", en: "Fear Allah wherever you are. Follow a bad deed with a good one to erase it, and treat people with excellent character.", source: "Tirmidhi 1987", narrator: "Muadh ibn Jabal رضي الله عنه" },
  { ar: "مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ", en: "Charity does not decrease wealth.", source: "Sahih Muslim 2588", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ", en: "Seeking knowledge is an obligation upon every Muslim.", source: "Ibn Majah 224", narrator: "Anas ibn Malik رضي الله عنه" },
  { ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever treads a path in search of knowledge, Allah will ease for him a path to Paradise.", source: "Sahih Muslim 2699", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا", en: "The most complete of the believers in faith is the best of them in character.", source: "Abu Dawud 4682", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "مَنْ لاَ يَرْحَمُ النَّاسَ لاَ يَرْحَمُهُ اللَّهُ", en: "He who does not show mercy to people will not be shown mercy by Allah.", source: "Sahih al-Bukhari 7376", narrator: "Jarir ibn Abdillah رضي الله عنه" },
  { ar: "الْمُؤْمِنُ لِلْمُؤْمِنِ كَالْبُنْيَانِ يَشُدُّ بَعْضُهُ بَعْضًا", en: "The believer to the believer is like a building, each part strengthening the other.", source: "Sahih al-Bukhari 481", narrator: "Abu Musa al-Ashari رضي الله عنه" },
  { ar: "تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ صَدَقَةٌ", en: "Your smile in the face of your brother is an act of charity.", source: "Tirmidhi 1956", narrator: "Abu Dharr رضي الله عنه" },
  { ar: "لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ، إِنَّمَا الشَّدِيدُ الَّذِي يَمْلِكُ نَفْسَهُ عِنْدَ الْغَضَبِ", en: "The strong person is not the one who can wrestle; the truly strong person is the one who controls himself when angry.", source: "Sahih al-Bukhari 6114", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "حُفَّتِ الْجَنَّةُ بِالْمَكَارِهِ وَحُفَّتِ النَّارُ بِالشَّهَوَاتِ", en: "Paradise is surrounded by hardships, and Hellfire is surrounded by desires.", source: "Sahih Muslim 2822", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ", en: "Be in this world as if you were a stranger or a wayfarer.", source: "Sahih al-Bukhari 6416", narrator: "Ibn Umar رضي الله عنه" },
  { ar: "مَنْ حَسُنَ إِسْلاَمُ الْمَرْءِ تَرْكُهُ مَا لاَ يَعْنِيهِ", en: "A sign of a person's good Islam is his leaving what does not concern him.", source: "Tirmidhi 2317", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ: إِلاَّ مِنْ صَدَقَةٍ جَارِيَةٍ، أَوْ عِلْمٍ يُنْتَفَعُ بِهِ، أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ", en: "When a person dies, his deeds come to an end except for three: ongoing charity, knowledge that benefits others, or a righteous child who prays for him.", source: "Sahih Muslim 1631", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "اسْتَعِنْ بِاللَّهِ وَلاَ تَعْجَزْ", en: "Seek the help of Allah and do not lose heart.", source: "Sahih Muslim 2664", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "الْيَدُ الْعُلْيَا خَيْرٌ مِنَ الْيَدِ السُّفْلَى", en: "The upper hand is better than the lower hand — the giving hand is better than the receiving.", source: "Sahih al-Bukhari 1427", narrator: "Ibn Umar رضي الله عنه" },
  { ar: "لاَ يَشْكُرُ اللَّهَ مَنْ لاَ يَشْكُرُ النَّاسَ", en: "He who is not grateful to people is not grateful to Allah.", source: "Abu Dawud 4811", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "مَنْ أَحَبَّ لِقَاءَ اللَّهِ أَحَبَّ اللَّهُ لِقَاءَهُ", en: "Whoever loves to meet Allah, Allah loves to meet him.", source: "Sahih al-Bukhari 6507", narrator: "Aishah رضي الله عنها" },
  { ar: "خَيْرُ الصَّدَقَةِ مَا كَانَ عَنْ ظَهْرِ غِنًى", en: "The best charity is that given when you yourself are in need.", source: "Sahih al-Bukhari 1426", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "مَنْ صَامَ رَمَضَانَ إِيمَانًا وَاحْتِسَابًا غُفِرَ لَهُ مَا تَقَدَّمَ مِنْ ذَنْبِهِ", en: "Whoever fasts Ramadan with faith and hoping for reward, his previous sins will be forgiven.", source: "Sahih al-Bukhari 38", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "أَحَبُّ النَّاسِ إِلَى اللَّهِ أَنْفَعُهُمْ لِلنَّاسِ", en: "The most beloved of people to Allah are those most beneficial to people.", source: "Al-Mu'jam al-Awsat 5787", narrator: "Ibn Umar رضي الله عنه" },
  { ar: "إِنَّ مِنْ أَحَبِّكُمْ إِلَيَّ أَحَاسِنَكُمْ أَخْلاَقًا", en: "The most beloved of you to me are those with the finest character.", source: "Sahih al-Bukhari 3759", narrator: "Jabir رضي الله عنه" },
  { ar: "رَأْسُ الأَمْرِ الإِسْلاَمُ، وَعَمُودُهُ الصَّلاَةُ، وَذِرْوَةُ سَنَامِهِ الْجِهَادُ", en: "The head of the matter is Islam, its pillar is the prayer, and its highest point is striving in the path of Allah.", source: "Tirmidhi 2616", narrator: "Muadh ibn Jabal رضي الله عنه" },
  { ar: "مَا مَلأَ ابْنُ آدَمَ وِعَاءً شَرًّا مِنْ بَطْنٍ", en: "No person has filled a vessel worse than their stomach. A few mouthfuls to keep the back straight are sufficient.", source: "Tirmidhi 2380", narrator: "Miqdam ibn Madikarib رضي الله عنه" },
  { ar: "إِنَّ الصِّدْقَ يَهْدِي إِلَى الْبِرِّ وَإِنَّ الْبِرَّ يَهْدِي إِلَى الْجَنَّةِ", en: "Truthfulness leads to righteousness, and righteousness leads to Paradise.", source: "Sahih al-Bukhari 6094", narrator: "Ibn Masud رضي الله عنه" },
  { ar: "مَنْ غَشَّنَا فَلَيْسَ مِنَّا", en: "Whoever deceives us is not of us.", source: "Sahih Muslim 101", narrator: "Abu Hurayrah رضي الله عنه" },
  { ar: "الطُّهُورُ شَطْرُ الإِيمَانِ", en: "Purity is half of faith.", source: "Sahih Muslim 223", narrator: "Abu Malik al-Ashari رضي الله عنه" },
  { ar: "خَيْرُكُمْ خَيْرُكُمْ لأَهْلِهِ وَأَنَا خَيْرُكُمْ لأَهْلِي", en: "The best of you is the best to his family, and I am the best of you to my family.", source: "Tirmidhi 3895", narrator: "Aishah رضي الله عنها" },
];

// ── Seerah Data ───────────────────────────────────────────────────────────
const SEERAH = [
  { title: "The Year of the Elephant 🐘", titleAr: "عام الفيل", year: "570 CE", content: "The year the Prophet ﷺ was born, Abraha — the Abyssinian ruler of Yemen — marched on the Kaabah with a mighty army and war elephants to destroy it. As they neared Makkah, Allah sent flocks of birds (Ababeel) raining stones of baked clay, devastating the entire army. This miracle, immortalized in Surah Al-Fil, declared to the world that the House of Allah is under divine protection — and set the stage for the arrival of the final Prophet ﷺ within the same year." },
  { title: "Birth of the Prophet ﷺ", titleAr: "مولد النبي ﷺ", year: "570 CE", content: "Muhammad ibn Abdullah ﷺ was born in Makkah on Monday, 12 Rabi al-Awwal. His father Abdullah had passed away before his birth. He was born into the noble Hashimite clan of Quraysh. His mother Aminah reported seeing a great light at his birth that illuminated the palaces of Syria. The Prophet ﷺ himself said: 'I am the supplication of my father Ibrahim, and the glad tidings foretold by Isa (AS).'" },
  { title: "Raised in the Desert 🏜️", titleAr: "النشأة في البادية", year: "570–575 CE", content: "Following Arabian custom, baby Muhammad ﷺ was entrusted to a Bedouin foster mother, Halimah al-Sa'diyyah, of the Banu Sa'd tribe. The desert upbringing strengthened children and preserved pure Arabic. While with Halimah, remarkable blessings followed — their livestock flourished beyond all expectation. This barakah was a sign of the extraordinary soul in their care. At age five, he ﷺ was returned to his mother." },
  { title: "The Opening of the Chest ✨", titleAr: "شق الصدر", year: "Around 574 CE", content: "While still a child with Halimah, two angels appeared to Muhammad ﷺ, opened his chest, removed his heart, cleansed it of a dark clot (the portion of Shaytan) with Zamzam water, and restored it. This spiritual purification — referenced in Surah Ash-Sharh ('Did We not expand your chest for you?') — was Allah's preparation of His Messenger's soul for the immense weight of prophethood that lay ahead." },
  { title: "Loss of His Mother 🌙", titleAr: "وفاة أمه آمنة", year: "576 CE", content: "At around six years old, Muhammad ﷺ traveled with his mother Aminah to Madinah to visit his father's grave. On the return journey she fell ill and passed away at Al-Abwa, leaving him a double orphan. His grandfather Abd al-Muttalib then embraced and raised him. The Quran would later comfort him: 'Did He not find you an orphan and give you shelter?' (93:6) — every loss was part of Allah's perfect shaping of His Messenger." },
  { title: "Al-Amin — The Trustworthy 🌟", titleAr: "الأمين", year: "Youth", content: "Before any revelation, the people of Makkah unanimously called Muhammad ﷺ 'Al-Amin' — the Trustworthy. Merchants left their goods in his care; people sought his counsel in disputes. Not a single enemy could accuse him of dishonesty. When he later stood on Mount Safa and said 'If I told you an army was coming over this hill, would you believe me?' — they all said yes. His character was his first credential." },
  { title: "Khadijah رضي الله عنها", titleAr: "السيدة خديجة", year: "595 CE", content: "Khadijah bint Khuwaylid was a respected businesswoman who hired Muhammad ﷺ to lead her trade caravans. Deeply impressed by his honesty and noble dealings, she proposed marriage. He was 25; she was 40. Their marriage was one of profound love and partnership. She was the first to believe in him, the first to console him at the cave, and she spent her entire wealth supporting Islam. The Prophet ﷺ never stopped praising her, even long after her passing." },
  { title: "Rebuilding of the Kaabah 🏛️", titleAr: "إعادة بناء الكعبة", year: "605 CE", content: "Floods damaged the Kaabah and the Quraysh rebuilt it. When the sacred Black Stone needed replacing, every tribe wanted the honour — nearly causing bloodshed. They agreed: let the next man to enter judge. Muhammad ﷺ walked in. His solution: he laid the stone on a cloak and invited each tribal chief to hold one edge, then placed the stone himself. A war was averted through wisdom. He was 35 — and five years away from prophethood." },
  { title: "The First Revelation 📖", titleAr: "نزول الوحي", year: "610 CE", content: "At forty, during spiritual retreat in the Cave of Hira, Jibreel (AS) appeared and embraced Muhammad ﷺ three times, commanding: 'Iqra!' (Read!). The Prophet ﷺ said he could not read. Then came the first words of the Quran: 'Read in the name of your Lord who created...' (96:1–5). Trembling, he returned to Khadijah who wrapped him and said: 'By Allah, He will never humiliate you.' The mission of the final Prophet had begun." },
  { title: "The First Muslims 🤲", titleAr: "أوائل المسلمين", year: "610 CE", content: "The first to believe: Khadijah (wife), Ali ibn Abi Talib (youth/family), Abu Bakr al-Siddiq (friend), and Zayd ibn Harithah (freed slave). These four — from every stratum of society — embodied Islam's universal reach from its very first hours. Through Abu Bakr came Uthman, Abdurrahman ibn Awf, Zubair, and many others. A community of faith was taking its first breath." },
  { title: "Dar al-Arqam — Secret Dawah 🏠", titleAr: "دار الأرقم", year: "610–613 CE", content: "For three years the call to Islam was quiet. Dar al-Arqam, near Mount Safa, became the first Islamic gathering place — where early Muslims memorized Quran, learned salah, and built brotherhood, away from Quraysh's eyes. Here the first generation was formed: in secret, in sincerity, in community. The most beautiful movements often begin quietly, before the storm of opposition forces them into the open." },
  { title: "Public Dawah Begins 📣", titleAr: "الجهر بالدعوة", year: "613 CE", content: "Allah commanded: 'So proclaim what you are commanded, and turn away from the polytheists.' (15:94). The Prophet ﷺ climbed Mount Safa, gathered the Quraysh, and warned them plainly. His uncle Abu Lahab dismissed him angrily — and Surah Al-Masad was revealed, condemning him by name. From this day, persecution intensified — but the message of Tawhid could no longer be contained." },
  { title: "Bilal and the Desert of Steadfastness 🔥", titleAr: "بلال والتعذيب", year: "613–615 CE", content: "Bilal ibn Rabah (RA) — an Abyssinian slave — accepted Islam and was dragged into the desert by his master Umayyah. A boulder was placed on his chest in the scorching heat. His only words: 'Ahad! Ahad!' (One! One!). Abu Bakr (RA) purchased and freed him. Bilal became the first muezzin of Islam — the same voice that cried in the desert would one day call the Adhan atop the Kaabah. Allah does not waste the steadfastness of the sincere." },
  { title: "First Hijrah — to Abyssinia 🌍", titleAr: "الهجرة الأولى", year: "615 CE", content: "Unable to bear the torture, the Prophet ﷺ advised companions to migrate to Abyssinia, whose Christian king (the Negus) was just. About 80 companions made this journey. When Quraysh envoys demanded their return, Jafar ibn Abi Talib (RA) recited from Surah Maryam. The Negus wept, drew a line on the ground and said: 'The difference between what you say about Isa and what I believe is no more than this line.' He refused to return the refugees. The first asylum in Islamic history." },
  { title: "Umar's Conversion ⚡", titleAr: "إسلام عمر رضي الله عنه", year: "615 CE", content: "Umar ibn al-Khattab — fearsome, powerful, fiercely opposed to Islam — set out one day to kill the Prophet ﷺ. He was told en route that his own sister had embraced Islam. Enraged, he went to her home and struck her. But seeing her blood moved something in him. When he read the opening verses of Surah Ta-Ha she had been memorizing, his heart broke open completely. He went directly to the Prophet ﷺ and declared his shahada. Ibn Masud said: 'Umar's Islam was a conquest.'" },
  { title: "The Boycott — Three Years of Hunger 📜", titleAr: "الحصار الاقتصادي", year: "616–619 CE", content: "The Quraysh imposed a three-year written boycott on the Prophet ﷺ and Banu Hashim — no trade, no marriage, no contact. They were confined to a narrow valley and nearly starved. Mothers cried with no food for their children. After three years, Allah caused the boycott scroll to be eaten by termites — leaving only 'Bismik Allahumma.' Moved by this miracle, the blockade was lifted. Sabr — patient endurance — was the only weapon that mattered." },
  { title: "The Year of Grief 💔", titleAr: "عام الحزن", year: "619 CE", content: "Within weeks of each other, the Prophet ﷺ lost his beloved wife Khadijah (RA) and his protecting uncle Abu Talib. He was now exposed — no tribal protection, no personal sanctuary. He traveled to Taif seeking support but was driven out by mobs who threw stones until his feet bled. Even then, when angels offered to crush Taif, he ﷺ refused: 'Perhaps from their descendants will come those who worship Allah alone.' His mercy never had a limit." },
  { title: "Al-Isra wal-Miraj 🌌", titleAr: "الإسراء والمعراج", year: "620 CE", content: "Allah comforted His Prophet ﷺ with the greatest journey in human history. In one night, he traveled from Makkah to Jerusalem on the Buraq, led all the prophets in prayer at Masjid al-Aqsa, then ascended through the seven heavens — meeting Adam, Yahya, Isa, Idris, Harun, Musa, and Ibrahim (peace be upon them all) — to the Divine Presence. The five daily prayers were gifted to the Ummah here. Not a burden — but the greatest gift: a direct connection to Allah, five times every day." },
  { title: "The Pledge of Aqabah 🤝", titleAr: "بيعة العقبة", year: "621–622 CE", content: "During Hajj seasons, the Prophet ﷺ met pilgrims from Yathrib (Madinah). In 622 CE, 73 men and 2 women pledged to protect him as they would protect their own families. He ﷺ told them: 'You are guaranteeing me what you guarantee your women and children. If you fulfil this, you will have Paradise.' They replied as one: 'We accept!' The political foundations of the first Islamic state were laid on a hillside in the dark, under the stars." },
  { title: "The Great Hijrah 🌙", titleAr: "الهجرة العظمى", year: "622 CE", content: "The Quraysh plotted to assassinate the Prophet ﷺ simultaneously. Informed by revelation, he left his house at night with Ali (RA) sleeping in his bed, reciting Surah Ya-Sin. He and Abu Bakr (RA) hid in the Cave of Thawr for three days — a spider's web and bird's nest covering the entrance. When they finally reached Madinah, the entire city came out singing 'Tala al-badru alayna.' The Islamic calendar begins with this migration — for it was the moment a community became a civilization." },
  { title: "The Charter of Madinah 📋", titleAr: "صحيفة المدينة", year: "622 CE", content: "One of the Prophet's ﷺ first acts was drafting a political document — the Constitution of Madinah. It defined rights of Muslims and Jewish tribes alike: freedom of religion, mutual defense, and justice for all. This may be the world's first written constitution. It proved that Islam's vision was never only spiritual — it was a complete civilization, built on justice, pluralism, and the rule of divine principles." },
  { title: "Battle of Badr ⚔️", titleAr: "غزوة بدر الكبرى", year: "624 CE", content: "On 17 Ramadan, 2 AH, 313 ill-equipped Muslims faced 1,000 well-armed Qurayshi warriors at the wells of Badr. The Prophet ﷺ prayed through the night: 'O Allah, if this group is destroyed, You will not be worshipped on earth.' Angels descended. The Muslims achieved a decisive victory. The Quran named this day 'Yawm al-Furqan' — the Day of Distinction. Islam had proven it could not be extinguished by force. The entire Arabian peninsula took notice." },
  { title: "Battle of Uhud — The Lesson 🏔️", titleAr: "غزوة أُحُد", year: "625 CE", content: "Three thousand Qurayshi soldiers came to avenge Badr. Early Muslim victory turned when 40 archers abandoned their hill to collect spoils — directly disobeying the Prophet's ﷺ orders. Khalid ibn al-Walid (then an enemy) swept around the exposed flank, reversing the battle. Seventy Muslims were martyred, including Hamzah (RA). The Prophet ﷺ was wounded. Allah comforted them: 'Do not weaken or grieve — you are superior if you are believers.' (3:139) Obedience to the Prophet ﷺ is never optional." },
  { title: "Battle of the Trench 🛡️", titleAr: "غزوة الأحزاب", year: "627 CE", content: "An allied force of 10,000 marched on Madinah. The Persian companion Salman al-Farisi (RA) suggested digging a trench — a tactic unknown in Arabia. The Prophet ﷺ worked alongside the companions digging in cold and hunger. When they found a rock too hard to break, he ﷺ struck it three times, and with each blow saw visions of the future conquests of Persia, Rome, and Yemen. The coalition besieged Madinah for weeks but never crossed the trench. Allah sent a devastating windstorm that routed them. The coalition never threatened Madinah again." },
  { title: "Treaty of Hudaybiyyah 🕊️", titleAr: "صلح الحديبية", year: "628 CE", content: "The Prophet ﷺ set out for Umrah with 1,400 companions but was blocked at Hudaybiyyah. Negotiations led to a ten-year peace treaty with terms that seemed unfavorable — they could not enter Makkah that year, and any Makkan Muslim who came to Madinah must be returned. Companions were distressed. But Allah called it 'a manifest victory' (Surah Al-Fath). The peace allowed Islam to spread freely, and within two years more people accepted Islam than in all previous years combined. Wisdom often looks like compromise." },
  { title: "Conquest of Makkah 🌟", titleAr: "فتح مكة المكرمة", year: "630 CE", content: "With 10,000 companions, the Prophet ﷺ entered Makkah — the city that had expelled, tortured, and killed his followers. He entered with his head bowed in humility. The Kaabah was cleansed of 360 idols. Then came the moment of truth: what would he do to his enemies? He asked: 'What do you think I will do with you?' They replied: 'You are a noble brother, son of a noble brother.' He said: 'Go — you are all free.' History has never seen such magnanimity in victory." },
  { title: "The Farewell Hajj 📣", titleAr: "حجة الوداع", year: "632 CE", content: "In the Prophet's ﷺ only Hajj, over 100,000 companions gathered on Arafat. He delivered the Farewell Sermon: life, property, and honour are sacred; all debts of pre-Islamic times are abolished; racial superiority is abolished — 'an Arab has no superiority over a non-Arab except in taqwa.' He asked: 'Have I delivered the message?' A hundred thousand voices replied: 'Yes!' Then came revelation: 'Today I have perfected your religion for you.' (5:3). Three months later, he returned to his Lord." },
  { title: "The Passing of the Prophet ﷺ 🌿", titleAr: "وفاة المصطفى ﷺ", year: "632 CE", content: "On Monday, 12 Rabi al-Awwal, 11 AH, the Prophet ﷺ peacefully departed. His last words were: 'The highest companion.' Umar (RA) could not accept it. Abu Bakr (RA) went to the mosque and said: 'Whoever worshipped Muhammad — Muhammad has died. Whoever worships Allah — Allah is Ever-Living and never dies.' He recited 3:144. A silence fell over the Ummah. Then, across generations, his message continued — carried by the Book he left, the Sunnah he embodied, and the community he built: us." },
  { title: "Abu Bakr al-Siddiq — The Closest Friend 🌕", titleAr: "أبو بكر الصديق رضي الله عنه", year: "Companion Era", content: "Abu Bakr (RA) was the Prophet's ﷺ closest companion — the only one to accompany him in the Hijrah cave. When the Prophet ﷺ first spoke of the Night Journey, and people called it impossible, Abu Bakr said: 'If he said it, I believe it.' This is why he was given the title 'al-Siddiq' — the Most Truthful. He spent his entire fortune on Islam, freed enslaved Muslims like Bilal, and became the first Caliph. His love for the Prophet ﷺ was total — the gold standard of companionship." },
  { title: "Umar ibn al-Khattab — Justice Personified ⚖️", titleAr: "عمر بن الخطاب رضي الله عنه", year: "Companion Era", content: "Umar (RA) was so feared in Makkah that Shaytan would take another street to avoid his path. After embracing Islam, that same fearlessness was turned entirely toward justice. He was the first to walk openly after his conversion. As Caliph, he would walk the streets of Madinah at night in disguise to check on citizens. He said: 'If a mule stumbles in Iraq, I fear Allah will ask me why I didn't pave the road.' He wore patched clothes while governing an empire — because power to him was a trust, not a privilege." },
  { title: "Aishah — Mother of the Believers 💛", titleAr: "السيدة عائشة رضي الله عنها", year: "Companion Era", content: "Aishah (RA) was the Prophet's ﷺ most learned wife and one of the greatest scholars Islam has known. She transmitted over 2,000 hadiths and was the first reference point for companions who wanted to know how the Prophet ﷺ prayed, fasted, and conducted himself in his home. After his ﷺ passing, she became a teacher to the entire Ummah — men and women would come to her curtained tent to learn. Abu Musa al-Ashari said: 'We companions never encountered a hadith we were unclear about and asked Aishah, except that we found knowledge about it with her.'" },
  { title: "The Spread of Islam — First Century 🌍", titleAr: "انتشار الإسلام", year: "632–732 CE", content: "Within one century of the Prophet's ﷺ passing, Islam had spread from Spain in the west to the borders of China in the east — not primarily by force, but by the justice, equality, and mercy of Islamic civilization. Whole peoples converted upon seeing Muslim merchants and governors. The speed was unprecedented in history. As Jafar ibn Abi Talib told the Negus: 'We were a people of ignorance — we wronged one another, oppressed the weak, ate what was forbidden. Then Allah sent a messenger and transformed us.' That transformation continued outward, changing the world." },
];

// ── Islamic Events (Hijri-based) ──────────────────────────────────────────
const ISLAMIC_EVENTS = [
  { hijriMonth: 1,  hijriDay: 1,  name: "Islamic New Year",          nameAr: "رأس السنة الهجرية", emoji: "🌙", daysWindow: 4,
    writeup: "The Islamic New Year marks the beginning of Muharram and commemorates the Hijrah — the Prophet's ﷺ migration from Makkah to Madinah in 622 CE. This migration was so pivotal that Umar ibn al-Khattab (RA) chose it as the starting point of the entire Islamic calendar. It is a time for deep reflection: just as the Prophet ﷺ left comfort and homeland for the sake of Allah, we renew our intention to prioritize our deen above all else. Begin this year with sincere tawbah, renewed goals for learning and worship, and a heart turned completely toward Allah." },
  { hijriMonth: 1,  hijriDay: 10, name: "Day of Ashura",             nameAr: "يوم عاشوراء",        emoji: "🤲", daysWindow: 4,
    writeup: "The 10th of Muharram — Ashura — is a day of great blessing. The Prophet ﷺ found the Jews of Madinah fasting and was told it commemorates Allah saving Musa (AS) and his people from Pharaoh. He said: 'We have more right to Musa than you,' and ordered fasting. Fasting Ashura expiates the sins of the previous year (Muslim). Combine it with the 9th to distinguish from Jewish practice. The Prophet ﷺ said he intended this. It is also a day of increased generosity — Ibn Abbas reported that being generous to one's family on this day brings divine generosity throughout the year." },
  { hijriMonth: 3,  hijriDay: 12, name: "Mawlid al-Nabawi ﷺ",        nameAr: "المولد النبوي الشريف", emoji: "💛", daysWindow: 7,
    writeup: "The 12th of Rabi al-Awwal marks the birth of the Prophet Muhammad ﷺ — the greatest mercy Allah ever bestowed on humanity: 'We sent you only as a mercy to the worlds.' (21:107). This is the most beautiful time to study his ﷺ life and character, increase salawat upon him, and renew our pledge to follow his Sunnah. Learn one new thing about him today. Send abundant durood: 'Allahumma salli ala Muhammad wa ala ali Muhammad.' The best celebration of his birthday is to live by his example — in prayer, in honesty, in mercy toward all creation." },
  { hijriMonth: 7,  hijriDay: 27, name: "Isra' and Mi'raj",           nameAr: "الإسراء والمعراج",    emoji: "🌌", daysWindow: 5,
    writeup: "The Night Journey and Ascension is among the greatest miracles in history. In a single night, the Prophet ﷺ traveled from Makkah to Jerusalem, led all the prophets in prayer, then ascended through the seven heavens to the Divine Presence — meeting Adam, Ibrahim, Musa, and Isa (peace be upon them). Most significantly: the five daily prayers were gifted to this Ummah on this night — reduced from fifty through Musa's counsel. The five prayers are the pillar of our connection to Allah, five times every day. How are you guarding this gift tonight?" },
  { hijriMonth: 8,  hijriDay: 15, name: "Laylat al-Bara'ah",          nameAr: "ليلة النصف من شعبان", emoji: "✨", daysWindow: 4,
    writeup: "The 15th night of Sha'ban holds special significance in the tradition of many scholars — a night of divine mercy and attention. The Prophet ﷺ said Sha'ban is a month people neglect between Rajab and Ramadan: 'It is a month in which deeds are raised to the Lord of the worlds, and I love my deeds to be raised while I am fasting.' (Nasa'i). This is the ideal time to prepare your heart for Ramadan — increase ibadah, seek forgiveness for any grievances, and set your intentions for the blessed month ahead." },
  { hijriMonth: 9,  hijriDay: 1,  name: "Ramadan Begins",             nameAr: "بداية رمضان المبارك",  emoji: "🌙", daysWindow: 4,
    writeup: "Ramadan — the month the Quran descended — has arrived! Allah says: 'The month of Ramadan in which the Quran was revealed as guidance for humanity.' (2:185). In a Hadith Qudsi, Allah says: 'Every deed of the son of Adam is for him, except fasting — it is for Me and I will reward it.' The gates of Paradise are opened, Hellfire's gates closed, and the shayateen chained. This is your month. Set your Quran completion goal. Protect each fast. Increase your night prayer. Give generously. Seek Laylat al-Qadr in the odd nights of the last ten. Marhaban ya Ramadan! 🌙" },
  { hijriMonth: 9,  hijriDay: 21, name: "Last Ten Nights of Ramadan", nameAr: "العشر الأواخر من رمضان", emoji: "⭐", daysWindow: 10,
    writeup: "The last ten nights of Ramadan are the most precious nights of the entire year. The Prophet ﷺ would 'tighten his belt' — a metaphor for extreme devotion — staying awake in worship, waking his family, and increasing every act of worship. Among these ten nights lies Laylat al-Qadr — better than a thousand months of worship (97:3). Scholars recommend seeking it in the odd nights: 21st, 23rd, 25th, 27th, 29th. The best dua: 'Allahumma innaka afuwwun tuhibbul afwa fa'fu anni' — O Allah, You love to pardon, so pardon me. Do not waste a single moment of these nights." },
  { hijriMonth: 9,  hijriDay: 27, name: "Laylat al-Qadr",             nameAr: "ليلة القدر المباركة",  emoji: "🌟", daysWindow: 3,
    writeup: "The Night of Power — Laylat al-Qadr — is the most blessed night in all of creation. On this night the Quran descended. Angels fill the earth, and Allah's mercy envelops all who stand in prayer. One night of worship equals 83+ years of continuous devotion. Aishah (RA) asked: 'If I witness this night, what shall I say?' The Prophet ﷺ taught her: 'Allahumma innaka afuwwun tuhibbul afwa fa'fu anni.' Stand in prayer tonight. Cry. Ask for everything — your parents, your family, the Ummah, the oppressed. This night can change your eternity. Do not let it slip." },
  { hijriMonth: 10, hijriDay: 1,  name: "Eid al-Fitr",               nameAr: "عيد الفطر المبارك",   emoji: "🎉", daysWindow: 3,
    writeup: "Eid al-Fitr — the Festival of Breaking the Fast — is Allah's gift to believers after a month of sincere worship. Today, the takbir fills the air: 'Allahu Akbar, Allahu Akbar, la ilaha illAllah, Allahu Akbar, Allahu Akbar wa lillahil hamd.' Before the prayer, give Zakat al-Fitr so every Muslim can celebrate. Wear your best. Greet your family and neighbours. The Prophet ﷺ would change his route on the way to and from Eid prayer, following a different path each way. To preserve the spirit of Ramadan, fast six days of Shawwal — together with Ramadan, it equals a full year of fasting. Eid Mubarak! 🌙" },
  { hijriMonth: 12, hijriDay: 1,  name: "First Days of Dhul Hijjah",  nameAr: "أيام ذي الحجة المباركة", emoji: "🕋", daysWindow: 10,
    writeup: "The first ten days of Dhul Hijjah are the most beloved days to Allah — even more than the final ten nights of Ramadan in their daytime deeds. The Prophet ﷺ said: 'There are no days in which righteous deeds are more beloved to Allah than these ten.' (Bukhari). If you are not making Hajj, maximize: fast as many days as possible (especially the 9th — Day of Arafah), give sadaqah, increase dhikr (subhanAllah, alhamdulillah, Allahu Akbar, la ilaha illAllah), recite Quran, and maintain family ties. These days are the Ramadan of the righteous who missed Ramadan's full reward." },
  { hijriMonth: 12, hijriDay: 9,  name: "Day of Arafah",              nameAr: "يوم عرفة الأعظم",     emoji: "🕋", daysWindow: 2,
    writeup: "The Day of Arafah is the greatest day of the year and the pinnacle of Hajj — 'Hajj is Arafah.' Over two million pilgrims stand on the plain of Arafat raising their hands, and Allah boasts to His angels: 'Look at My servants — they came to Me disheveled and dusty from every distant land.' Fasting today expiates two years of sins (Muslim). For non-pilgrims: fast this day, make abundant dua from Dhuhr to Maghrib, recite 'La ilaha illAllah wahdahu la sharika lah, lahul mulku wa lahul hamdu wa huwa ala kulli shay'in qadir' 100 times. What will you ask Allah for today?" },
  { hijriMonth: 12, hijriDay: 10, name: "Eid al-Adha",               nameAr: "عيد الأضحى المبارك",  emoji: "🐑", daysWindow: 4,
    writeup: "Eid al-Adha commemorates the supreme test of Ibrahim (AS) — his willingness to sacrifice his son Ismail (AS) at Allah's command. When Ibrahim demonstrated absolute submission, Allah replaced the sacrifice with a ram and declared: 'Indeed, this was the clear triumph.' (37:106). The Udhiyah (sacrifice) we make honors this legacy — but remember: 'It is not their meat nor their blood that reaches Allah, but it is the piety from you that reaches Him.' (22:37). Share generously — one-third for family, one-third for neighbors, one-third for the poor. Eid Adha Mubarak! 🕋" },
];

// ── News item type ─────────────────────────────────────────────────────────
interface NewsItem {
  title: string;
  link: string;
  description: string;
  thumbnail: string;
  pubDate: string;
}

// ── Tab type ──────────────────────────────────────────────────────────────
type TabId = "hadith" | "seerah" | "event" | "news";

interface Props { language?: string; }

// ═══════════════════════════════════════════════════════════════════════════
const IslamicDailyFeed: React.FC<Props> = ({ language = "en" }) => {
  const doy    = dayOfYear();
  const today  = new Date();

  // Daily rotating content
  const dailyHadith = HADITHS[doy % HADITHS.length];
  const dailySeerah = SEERAH[doy  % SEERAH.length];

  // Find upcoming / active Islamic event (look 14 days ahead)
  const upcomingEvent = (() => {
    for (let i = 0; i < 14; i++) {
      const check  = new Date(today.getTime() + i * 86_400_000);
      const { day, month } = getHijriNumeric(check);
      const ev = ISLAMIC_EVENTS.find(e => {
        const diff = Math.abs(e.hijriDay - day);
        return e.hijriMonth === month && diff <= (e.daysWindow ?? 3);
      });
      if (ev) return { event: ev, daysAway: i };
    }
    // Fallback: rotate through events daily so tab is never empty
    return { event: ISLAMIC_EVENTS[doy % ISLAMIC_EVENTS.length], daysAway: -1 };
  })();

  const [activeTab, setActiveTab] = useState<TabId>("hadith");
  const [news, setNews]           = useState<NewsItem[]>([]);
  const [newsLoading, setNL]      = useState(false);
  const [newsError,   setNE]      = useState(false);
  const [expanded,    setExp]     = useState(false); // seerah / event read-more

  // If an event is imminent, spotlight it first
  useEffect(() => {
    if (upcomingEvent.daysAway >= 0 && upcomingEvent.daysAway <= 2) setActiveTab("event");
  }, []);

  // Reset expanded state when tab changes
  useEffect(() => { setExp(false); }, [activeTab]);

  // Fetch Islamic news when tab is selected
  useEffect(() => {
    if (activeTab !== "news" || news.length > 0 || newsLoading) return;
    setNL(true); setNE(false);
    fetch("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Faboutislam.net%2Ffeed%2F&count=5")
      .then(r => r.json())
      .then(d => {
        if (d.status === "ok" && d.items?.length) {
          setNews(d.items.map((it: any) => ({
            title:       it.title?.replace(/&#\d+;/g, "").trim() || "",
            link:        it.link  || "#",
            description: (it.description || "").replace(/<[^>]*>/g, "").slice(0, 110).trim() + "…",
            thumbnail:   it.thumbnail || it.enclosure?.link || "",
            pubDate:     it.pubDate || "",
          })));
        } else setNE(true);
      })
      .catch(() => setNE(true))
      .finally(() => setNL(false));
  }, [activeTab]);

  const t = (en: string, ar: string) => language === "ar" ? ar : en;

  const tabs: { id: TabId; label: string; labelAr: string; icon: any; color: string }[] = [
    { id: "hadith", label: "Hadith",  labelAr: "حديث",   icon: BookMarked,   color: DARK_GREEN },
    { id: "seerah", label: "Seerah",  labelAr: "سيرة",   icon: ScrollText,   color: AMBER },
    { id: "event",  label: "Events",  labelAr: "مناسبة", icon: CalendarDays, color: MID_GREEN },
    { id: "news",   label: "News",    labelAr: "أخبار",  icon: Newspaper,    color: "#1e3a5f" },
  ];

  const card: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    boxShadow: "0 2px 16px rgba(0,0,0,.06)",
    overflow: "hidden",
  };

  // ── Format relative news date ───────────────────────────────────────────
  const relDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (diff === 0) return "Today";
      if (diff === 1) return "Yesterday";
      return `${diff}d ago`;
    } catch { return ""; }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Star style={{ width: 14, height: 14, color: GOLD, fill: GOLD }} />
        <span style={{ fontSize: 15, fontWeight: 900, color: TEXT_DARK, fontFamily: "'Playfair Display', serif" }}>
          {t("Islamic Daily", "يوميتك الإسلامية")}
        </span>
        <Star style={{ width: 14, height: 14, color: GOLD, fill: GOLD }} />
      </div>

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <div style={card}>

        {/* Tab strip */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, padding: "12px 4px", border: "none", cursor: "pointer",
                background: active ? "#fff" : "transparent",
                borderBottom: active ? `2.5px solid ${tab.color}` : "2.5px solid transparent",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all .15s",
              }}>
                <tab.icon style={{ width: 16, height: 16, color: active ? tab.color : TEXT_LIGHT }} />
                <span style={{ fontSize: 10, fontWeight: active ? 800 : 500, color: active ? tab.color : TEXT_LIGHT }}>
                  {t(tab.label, tab.labelAr)}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── HADITH TAB ─────────────────────────────────────────────────── */}
        {activeTab === "hadith" && (
          <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 100%)`, padding: "22px 20px" }}>

            {/* Badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BookMarked style={{ width: 13, height: 13, color: GOLD }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.06em", fontFamily: "'Playfair Display', serif" }}>
                  {t("Hadith of the Day", "حديث اليوم")}
                </span>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "3px 9px" }}>
                {t("Authenticated", "صحيح")}
              </span>
            </div>

            {/* Arabic text */}
            <p style={{ fontFamily: "'Scheherazade New','Amiri Quran','Amiri',serif", fontSize: 22, lineHeight: 2.0, color: "#fff", textAlign: "center", direction: "rtl", margin: "0 0 14px", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
              {dailyHadith.ar}
            </p>

            {/* Gold divider */}
            <div style={{ width: 40, height: 1.5, background: GOLD, margin: "0 auto 14px", borderRadius: 2 }} />

            {/* Translation */}
            <p style={{ fontSize: 13, lineHeight: 1.7, fontStyle: "italic", color: "rgba(255,255,255,0.88)", textAlign: "center", margin: "0 0 14px" }}>
              "{dailyHadith.en}"
            </p>

            {/* Attribution */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>{dailyHadith.source}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{t("Narrated by", "عن")} {dailyHadith.narrator}</span>
            </div>
          </div>
        )}

        {/* ── SEERAH TAB ─────────────────────────────────────────────────── */}
        {activeTab === "seerah" && (
          <div style={{ background: AMBER_BG, padding: "20px 20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <ScrollText style={{ width: 14, height: 14, color: AMBER }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: AMBER, letterSpacing: "0.06em", fontFamily: "'Playfair Display', serif" }}>
                {t("Daily Seerah", "السيرة النبوية")}
              </span>
              <div style={{ marginLeft: "auto", background: `${AMBER}18`, border: `1px solid ${AMBER}44`, borderRadius: 20, padding: "3px 9px" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: AMBER }}>{dailySeerah.year}</span>
              </div>
            </div>

            {/* Timeline dot + title */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div style={{ flexShrink: 0, marginTop: 3 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: AMBER, boxShadow: `0 0 0 3px ${AMBER}33` }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 900, color: TEXT_DARK, margin: "0 0 2px", fontFamily: "'Playfair Display', serif", lineHeight: 1.3 }}>
                  {dailySeerah.title}
                </h3>
                <p style={{ fontSize: 11, color: AMBER, margin: 0, fontFamily: "'Amiri', serif" }} dir="rtl">
                  {dailySeerah.titleAr}
                </p>
              </div>
            </div>

            {/* Content */}
            <div style={{ marginLeft: 24, borderLeft: `2px solid ${AMBER}33`, paddingLeft: 14 }}>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "#44200a", margin: 0, display: "-webkit-box", WebkitLineClamp: expanded ? 999 : 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {dailySeerah.content}
              </p>
              {dailySeerah.content.length > 200 && (
                <button onClick={() => setExp(v => !v)} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: AMBER, padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  {expanded ? t("Show less ↑", "أقل ↑") : t("Read more ↓", "اقرأ أكثر ↓")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── EVENTS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "event" && (() => {
          const { event, daysAway } = upcomingEvent;
          return (
            <div>
              {/* Event banner */}
              <div style={{ background: `linear-gradient(135deg, ${DARK_GREEN} 0%, #1a5c35 100%)`, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarDays style={{ width: 13, height: 13, color: GOLD }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: "0.05em", fontFamily: "'Playfair Display', serif" }}>
                      {t("Islamic Event", "مناسبة إسلامية")}
                    </span>
                  </div>
                  {daysAway === 0 && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: GOLD, borderRadius: 20, padding: "3px 9px" }}>
                      {t("TODAY ✨", "اليوم ✨")}
                    </span>
                  )}
                  {daysAway > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 20, padding: "3px 9px" }}>
                      {t(`In ${daysAway} day${daysAway > 1 ? "s" : ""}`, `خلال ${daysAway} يوم`)}
                    </span>
                  )}
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{event.emoji}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 900, color: "#fff", margin: "0 0 4px", fontFamily: "'Playfair Display', serif" }}>
                    {event.name}
                  </h3>
                  <p style={{ fontFamily: "'Scheherazade New','Amiri',serif", fontSize: 18, color: GOLD_LIGHT, margin: 0, direction: "rtl" }}>
                    {event.nameAr}
                  </p>
                </div>
              </div>

              {/* Writeup */}
              <div style={{ padding: "18px 20px" }}>
                <p style={{ fontSize: 13, lineHeight: 1.85, color: TEXT_DARK, margin: 0, display: "-webkit-box", WebkitLineClamp: expanded ? 999 : 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {event.writeup}
                </p>
                <button onClick={() => setExp(v => !v)} style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: MID_GREEN, padding: 0 }}>
                  {expanded ? t("Show less ↑", "أقل ↑") : t("Read more ↓", "اقرأ أكثر ↓")}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── NEWS TAB ───────────────────────────────────────────────────── */}
        {activeTab === "news" && (
          <div style={{ padding: "16px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Newspaper style={{ width: 13, height: 13, color: "#1e3a5f" }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#1e3a5f", fontFamily: "'Playfair Display', serif" }}>
                  {t("Islamic News", "أخبار إسلامية")}
                </span>
              </div>
              {newsError && (
                <button onClick={() => { setNE(false); setNL(false); setNews([]); setTimeout(() => setActiveTab("news"), 10); }}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: TEXT_MED }}>
                  <RefreshCw style={{ width: 11, height: 11 }} /> {t("Retry", "إعادة")}
                </button>
              )}
            </div>

            {newsLoading && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${DARK_GREEN}`, borderTopColor: "transparent", animation: "spin .7s linear infinite", margin: "0 auto 8px" }} />
                <span style={{ fontSize: 11, color: TEXT_LIGHT }}>{t("Loading news…", "جاري التحميل…")}</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {newsError && !newsLoading && (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: TEXT_LIGHT }}>{t("Unable to load news. Check your connection.", "تعذّر تحميل الأخبار. تحقق من اتصالك.")}</p>
              </div>
            )}

            {!newsLoading && !newsError && news.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {news.map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 12, padding: "11px 12px", borderRadius: 12, background: "#f8fafc", border: `1px solid ${BORDER}`, alignItems: "flex-start" }}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" style={{ width: 58, height: 58, borderRadius: 9, objectFit: "cover", flexShrink: 0, background: "#e5e7eb" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 58, height: 58, borderRadius: 9, background: `${DARK_GREEN}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Newspaper style={{ width: 20, height: 20, color: TEXT_LIGHT }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: TEXT_DARK, margin: "0 0 4px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {item.title}
                        </p>
                        <p style={{ fontSize: 11, color: TEXT_LIGHT, margin: "0 0 5px", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {item.description}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: TEXT_LIGHT }}>{relDate(item.pubDate)}</span>
                          <ExternalLink style={{ width: 9, height: 9, color: TEXT_LIGHT }} />
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
                <p style={{ textAlign: "center", fontSize: 10, color: TEXT_LIGHT, margin: "4px 0 0" }}>
                  Source: AboutIslam.net
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IslamicDailyFeed;
