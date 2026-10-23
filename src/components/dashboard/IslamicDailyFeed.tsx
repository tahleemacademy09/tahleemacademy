/*  src/components/dashboard/IslamicDailyFeed.tsx
    Islamic Daily Feed — Daily Quran + Ibn Katheer · Dorar Hadith · Aqeedah Wasitiyyah · Seerah · Events · News
*/
import { useState, useEffect } from "react";
import { BookMarked, ScrollText, CalendarDays, Newspaper, ExternalLink, RefreshCw,
         Star, ChevronDown, ChevronUp, Shield, BookOpen } from "lucide-react";
import { SEERAH_EPISODES } from "./SeerahData";

const DARK_GREEN = "#0f2d1f";
const MID_GREEN  = "#1a4731";
const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e4c36a";
const TEXT_DARK  = "#0f2d1f";
const TEXT_MED   = "#4a7c59";
const TEXT_LIGHT = "#7a9e88";
const BORDER     = "rgba(15,45,31,0.1)";
const AMBER      = "#92400e";
const AMBER_BG   = "#fffbeb";

const dayOfYear = () =>
  Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

// ── Daily Quran Verses with full text + Tafseer Ibn Katheer ─────────────────
// Each entry: surah:ayah, full Arabic, English translation, and Ibn Katheer summary
const DAILY_VERSES = [
  {
    ref: "Al-Fatiha 1:1–7", surah: 1, ayah: 1,
    ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾ الرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾ مَالِكِ يَوْمِ الدِّينِ ﴿٤﴾ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ﴿٥﴾ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾",
    en: "In the name of Allah, the Most Gracious, the Most Merciful. All praise is due to Allah, Lord of all worlds. The Most Gracious, the Most Merciful. Master of the Day of Judgement. You alone we worship and You alone we ask for help. Guide us to the straight path — the path of those You have blessed, not of those who have earned anger, nor of those who are astray.",
    tafseer: "Ibn Katheer opens his entire tafseer with Al-Fatiha, calling it the greatest surah in the Quran. The Prophet ﷺ confirmed: 'There is nothing in the Torah, the Injeel, the Zaboor, or the Quran like it.' (Tirmidhi, Hasan Sahih). 'Rabb al-Alameen' — Lord of all worlds — establishes that Allah's lordship is not restricted to the Arabs or believers but encompasses all of creation: humans, jinn, angels, animals and every dimension of existence. 'Maliki Yawm al-Deen' — Master of the Day of Judgement — reminds us that the true king is Allah alone on that day when all authority of every ruler expires. Ibn Katheer notes that 'Iyyaka na'budu wa iyyaka nasta'een' — 'You alone we worship and You alone we seek help from' — is the heart of the surah, combining tawheed of worship and tawheed of trust. The 'straight path' is defined by the Prophet ﷺ himself as Islam (Ahmad, Sahih). Those who 'earned anger' are identified by the Prophet ﷺ as those who knew the truth and rejected it; those 'astray' are those who worshipped without knowledge.",
    quranCom: "https://quran.com/1",
  },
  {
    ref: "Al-Baqarah 2:255 — Ayat al-Kursi", surah: 2, ayah: 255,
    ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ ﴿٢٥٥﴾",
    en: "Allah — there is no god except Him, the Ever-Living, the Sustainer of all existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who could intercede with Him except by His permission? He knows what is before them and what is behind them, and they encompass not a thing of His knowledge except what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
    tafseer: "Ibn Katheer calls Ayat al-Kursi the greatest verse in the Quran, confirmed by the Prophet ﷺ himself who asked Ubayy ibn Ka'b: 'Which verse of Allah's Book is the greatest?' and confirmed: 'Ayat al-Kursi.' (Muslim 810). Ibn Katheer explains each name: Al-Hayy (the Ever-Living) means He has eternal life with no beginning and no end, unlike created beings. Al-Qayyum (the Self-Sustaining) means He sustains all of creation without Himself needing anything — if He withheld His sustaining for a single moment, the universe would cease to exist. The Kursi — often translated as 'footstool' or 'throne' — is described by Ibn Abbas (RA) as the place of Allah's feet, while the Arsh (Throne) is beyond measure. Ibn Katheer reports the authentic narration: 'The seven heavens and earth beside the Kursi are like a ring thrown in a desert, and the Kursi beside the Throne is the same.' (Ibn Abi Shaybah, authenticated). Reciting this verse after every prayer — confirmed by the Prophet ﷺ — is among the greatest protective supplications.",
    quranCom: "https://quran.com/2/255",
  },
  {
    ref: "Al-Baqarah 2:285–286", surah: 2, ayah: 285,
    ar: "آمَنَ الرَّسُولُ بِمَا أُنزِلَ إِلَيْهِ مِن رَّبِّهِ وَالْمُؤْمِنُونَ ۚ كُلٌّ آمَنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِّن رُّسُلِهِ ۚ وَقَالُوا سَمِعْنَا وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ ﴿٢٨٥﴾ لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا ۚ لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْ ۗ رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا ۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِن قَبْلِنَا ۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنتَ مَوْلَانَا فَانصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ ﴿٢٨٦﴾",
    en: "The Messenger has believed in what was revealed to him from his Lord, and so have the believers. All of them have believed in Allah, His angels, His books, and His messengers, saying: 'We make no distinction between any of His messengers.' And they say: 'We hear and we obey. Grant us Your forgiveness, our Lord, and to You is the final destination.' Allah does not burden a soul beyond that it can bear. It will have what it earned, and it will bear what it has incurred. 'Our Lord, do not punish us if we have forgotten or made an error. Our Lord, lay not upon us a burden like that which You laid upon those before us. Our Lord, burden us not with that which we have no ability to bear. And pardon us; and forgive us; and have mercy upon us. You are our protector, so give us victory over the disbelieving people.'",
    tafseer: "Ibn Katheer reports that when these final two verses of Al-Baqarah descended, Jibreel (AS) said: 'Rejoice in two lights that have been given to you which no prophet before you was given.' (Muslim 806). The Prophet ﷺ confirmed: 'Whoever recites the last two verses of Surah Al-Baqarah at night, they will suffice him.' — meaning: protect him from harm. Ibn Katheer explains 'La nufarriqu bayna ahadin min rusulihi' (we make no distinction between messengers) as a key creedal statement: a Muslim believes in all 124,000 prophets, accepts them all and rejects none. 'La yukallifu Allahu nafsan illa wus'aha' — Allah does not burden a soul beyond its capacity — is one of the great mercy-verses. Ibn Katheer references the hadith Qudsi where Allah responded 'yes' to each of the five petitions in 2:286, promising to not hold Muslims accountable for forgetting or errors, and lifting the severe burdens placed on previous nations.",
    quranCom: "https://quran.com/2/285",
  },
  {
    ref: "Aal-Imran 3:185", surah: 3, ayah: 185,
    ar: "كُلُّ نَفْسٍ ذَائِقَةُ الْمَوْتِ ۗ وَإِنَّمَا تُوَفَّوْنَ أُجُورَكُمْ يَوْمَ الْقِيَامَةِ ۖ فَمَن زُحْزِحَ عَنِ النَّارِ وَأُدْخِلَ الْجَنَّةَ فَقَدْ فَازَ ۗ وَمَا الْحَيَاةُ الدُّنْيَا إِلَّا مَتَاعُ الْغُرُورِ ﴿١٨٥﴾",
    en: "Every soul will taste death, and you will only be given your full compensation on the Day of Resurrection. Whoever is kept away from the Fire and admitted to Paradise has attained success. And what is the life of this world except the enjoyment of delusion.",
    tafseer: "Ibn Katheer opens his commentary on this verse by saying it is a universal decree from which no prophet, no angel, no creation is exempt — death is the great equaliser. He quotes Ibn Umar (RA): 'When evening comes, do not expect to live until morning. When morning comes, do not expect to live until evening.' The phrase 'man zuhziha anil-nar wa udkhilal-jannah faqad faz' — whoever is kept away from the Fire and entered into Paradise has truly succeeded — Ibn Katheer says this is the most concise definition of success in the Quran. He notes the word 'faz' (success) is emphatic and total, meaning no qualification or asterisk. 'Mata' al-ghurur' — the enjoyment of delusion — Ibn Katheer explains with the famous parable from the hadith: the dunya relative to the akhirah is like a man who dips his finger into the ocean and considers how much water is on his finger versus what remains (Muslim 2858). Everything of the dunya will perish; only deeds and their consequences survive death.",
    quranCom: "https://quran.com/3/185",
  },
  {
    ref: "An-Nisa 4:36", surah: 4, ayah: 36,
    ar: "وَاعْبُدُوا اللَّهَ وَلَا تُشْرِكُوا بِهِ شَيْئًا ۖ وَبِالْوَالِدَيْنِ إِحْسَانًا وَبِذِي الْقُرْبَىٰ وَالْيَتَامَىٰ وَالْمَسَاكِينِ وَالْجَارِ ذِي الْقُرْبَىٰ وَالْجَارِ الْجُنُبِ وَالصَّاحِبِ بِالْجَنبِ وَابْنِ السَّبِيلِ وَمَا مَلَكَتْ أَيْمَانُكُمْ ۗ إِنَّ اللَّهَ لَا يُحِبُّ مَن كَانَ مُخْتَالًا فَخُورًا ﴿٣٦﴾",
    en: "Worship Allah and associate nothing with Him, and to parents do good, and to relatives, orphans, the needy, the near neighbour, the neighbour farther away, the companion at your side, the traveller, and those whom your right hands possess. Indeed, Allah does not like those who are self-deluding and boastful.",
    tafseer: "Ibn Katheer notes that this verse packages the entire ethical structure of Islam in a single ayah: it begins with tawheed (worship Allah alone) and immediately connects it to ihsan (excellence) to eight categories of people. He explains that placing parents directly after Allah indicates their station — the Prophet ﷺ confirmed this connection saying: 'The pleasure of Allah is in the pleasure of the parent.' (Tirmidhi, Sahih). The two types of neighbours — 'near' and 'far' — are explained by Ibn Abbas (RA) and Mujahid as: the near neighbour is Muslim and related to you; the far neighbour is non-Muslim or unrelated. Both have rights. Ibn Katheer quotes the Prophet ﷺ: 'Jibreel kept advising me about the neighbour until I thought he would make him an heir.' (Bukhari 6015). The ending — 'Allah does not love the mukhtaal (self-deluded) fakhoor (boastful)' — is a direct contrast: worship and service to others is incompatible with arrogance.",
    quranCom: "https://quran.com/4/36",
  },
  {
    ref: "Al-An'am 6:162–163", surah: 6, ayah: 162,
    ar: "قُلْ إِنَّ صَلَاتِي وَنُسُكِي وَمَحْيَايَ وَمَمَاتِي لِلَّهِ رَبِّ الْعَالَمِينَ ﴿١٦٢﴾ لَا شَرِيكَ لَهُ ۖ وَبِذَٰلِكَ أُمِرْتُ وَأَنَا أَوَّلُ الْمُسْلِمِينَ ﴿١٦٣﴾",
    en: "Say: Indeed, my prayer, my rites of sacrifice, my living and my dying are for Allah, Lord of all worlds. No partner has He. And this I have been commanded, and I am the first of the Muslims.",
    tafseer: "Ibn Katheer explains that this declaration — which is recited in tashahud and at the opening of salah in many schools of fiqh — is the complete surrender of a believer to Allah: every act of worship (salah), every sacrifice (nusuk), every moment of life and every moment of death all belong to Allah alone. He notes this verse is a refutation of the mushrikeen who would dedicate slaughter and rites to idols. 'Wa ana awwalu al-muslimeen' — 'I am the first of the Muslims' — refers to the Prophet ﷺ being the first of his particular Ummah to submit, not that he preceded Ibrahim (AS), as Ibn Katheer clarifies citing the sequence of revelation. This verse is the theological foundation for the Islamic principle that 'ibadah (worship) in its broadest sense encompasses all of life — how one earns, how one speaks, how one sleeps — when done for Allah's sake.",
    quranCom: "https://quran.com/6/162",
  },
  {
    ref: "Al-Kahf 18:10", surah: 18, ayah: 10,
    ar: "إِذْ أَوَى الْفِتْيَةُ إِلَى الْكَهْفِ فَقَالُوا رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا ﴿١٠﴾",
    en: "When the youths took refuge in the cave and said: 'Our Lord, grant us from Yourself mercy and prepare for us from our affair right guidance.'",
    tafseer: "Ibn Katheer describes the People of the Cave as young men — fityah, emphasising their youth — who fled a tyrant king to preserve their faith. He notes the beauty of their du'a: it contains only two requests — rahma (mercy from Allah) and rushd (right guidance in their situation). They did not ask for wealth, safety, or comfort — only mercy and correct direction. This, Ibn Katheer says, is the model du'a of the believer in crisis: turn to Allah first, seek His mercy, then ask only for guidance on how to proceed. He also notes this surah's special status: the Prophet ﷺ said reciting it on Fridays protects from the Dajjal (Abu Dawud, Sahih). Ibn Katheer connects the youths' flight for their religion to the Prophet ﷺ's own hijrah — both are examples of preserving deen over dunya, trusting in Allah's plan even when the physical situation looks hopeless.",
    quranCom: "https://quran.com/18/10",
  },
  {
    ref: "Al-Mu'minun 23:1–11", surah: 23, ayah: 1,
    ar: "قَدْ أَفْلَحَ الْمُؤْمِنُونَ ﴿١﴾ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ ﴿٢﴾ وَالَّذِينَ هُمْ عَنِ اللَّغْوِ مُعْرِضُونَ ﴿٣﴾ وَالَّذِينَ هُمْ لِلزَّكَاةِ فَاعِلُونَ ﴿٤﴾ وَالَّذِينَ هُمْ لِفُرُوجِهِمْ حَافِظُونَ ﴿٥﴾",
    en: "Certainly have the believers succeeded — those who are humbly submissive in their prayer, who turn away from ill speech, who act in giving zakat, and who guard their private parts...",
    tafseer: "Ibn Katheer notes that 'Qad aflaha al-mu'minoon' opens with 'qad' — a particle of certainty and emphasis — meaning: the believers have definitively, certainly, completely succeeded. He describes the seven qualities listed as a ladder of faith, beginning with khushu' (humility/presence of heart) in salah, which he says is the soul of salah — the Prophet ﷺ said: 'A person prays and nothing is written for him except a tenth, a ninth, an eighth...' (Abu Dawud, Hasan). The second quality is turning away from laghw — idle, useless speech and action — which Ibn Katheer connects to the preservation of time. The third, giving zakat, represents the social duty of the believer. These verses, Ibn Katheer notes, were revealed at a moment of great difficulty for the early Muslims in Makkah, coming as a promise from Allah: your success is guaranteed by these qualities, regardless of what the kuffar do.",
    quranCom: "https://quran.com/23/1",
  },
  {
    ref: "Luqman 31:12–13", surah: 31, ayah: 12,
    ar: "وَلَقَدْ آتَيْنَا لُقْمَانَ الْحِكْمَةَ أَنِ اشْكُرْ لِلَّهِ ۚ وَمَن يَشْكُرْ فَإِنَّمَا يَشْكُرُ لِنَفْسِهِ ۖ وَمَن كَفَرَ فَإِنَّ اللَّهَ غَنِيٌّ حَمِيدٌ ﴿١٢﴾ وَإِذْ قَالَ لُقْمَانُ لِابْنِهِ وَهُوَ يَعِظُهُ يَا بُنَيَّ لَا تُشْرِكْ بِاللَّهِ ۖ إِنَّ الشِّرْكَ لَظُلْمٌ عَظِيمٌ ﴿١٣﴾",
    en: "And We had certainly given Luqman wisdom, saying: 'Be grateful to Allah.' And whoever is grateful, is grateful for the benefit of himself. And whoever is ungrateful — then indeed, Allah is Free of need and Praiseworthy. And when Luqman said to his son while he was instructing him: 'O my son, do not associate anything with Allah. Indeed, association with Him is great injustice.'",
    tafseer: "Ibn Katheer identifies Luqman as a righteous man given hikmah (wisdom) — not prophethood. His first piece of wisdom, directly from Allah, is shukr (gratitude). Ibn Katheer explains: 'Whoever is grateful, is grateful for himself' — meaning the benefits of gratitude return entirely to the one who is grateful, as Allah has no need of our thanks. The second wisdom — the advice to his son — begins with the single most important piece of guidance a father can give: 'Do not commit shirk with Allah.' Ibn Katheer emphasises the word 'zulm azeem' (great injustice/wrongdoing): the Prophet ﷺ was asked what zulm azeem was and he recited this verse (Bukhari 3429). Shirk is the greatest injustice because it assigns partnership to the One who has no partner, creator to one who creates nothing, and worthy of worship to that which deserves none. Everything else a father teaches his child — manners, earning, social conduct — comes after this foundational truth.",
    quranCom: "https://quran.com/31/12",
  },
  {
    ref: "Az-Zumar 39:53", surah: 39, ayah: 53,
    ar: "قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا ۚ إِنَّهُ هُوَ الْغَفُورُ الرَّحِيمُ ﴿٥٣﴾",
    en: "Say: O My servants who have transgressed against themselves, do not despair of the mercy of Allah. Indeed, Allah forgives all sins. Indeed, it is He who is the Forgiving, the Merciful.",
    tafseer: "Ibn Katheer calls this 'the verse of hope' and says no verse in the Quran contains a broader invitation to forgiveness. He notes the address begins 'Ya ibadi' — O My servants — maintaining the relationship of worship even while addressing those who have sinned greatly. 'Asrafu ala anfusihim' — those who have transgressed against themselves — Ibn Katheer says covers every category of sin, major and minor, repeated and singular. 'La taqnatu min rahmatillah' — do not despair of Allah's mercy — uses 'qunut', which means complete hopelessness that causes a person to stop trying. This, Ibn Katheer says, is itself a sin: to believe one's sins are too large for Allah's mercy is a form of belittling Allah's attribute of Al-Ghafoor (the Ever-Forgiving). He cites the famous hadith qudsi: 'O son of Adam, if you were to come to Me with sins nearly as great as the earth, and then you met Me without associating anything with Me, I would bring you forgiveness nearly as great as the earth.' (Tirmidhi 3540, Hasan Sahih).",
    quranCom: "https://quran.com/39/53",
  },
  {
    ref: "Al-Hujurat 49:13", surah: 49, ayah: 13,
    ar: "يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ۚ إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ ۚ إِنَّ اللَّهَ عَلِيمٌ خَبِيرٌ ﴿١٣﴾",
    en: "O mankind, indeed We have created you from male and female and made you peoples and tribes that you may know one another. Indeed, the most noble of you in the sight of Allah is the most righteous of you. Indeed, Allah is Knowing and Expert.",
    tafseer: "Ibn Katheer opens his tafseer of this verse by noting it addresses 'al-naas' (all mankind), not just believers — making it a universal statement. The diversity of tribes and nations, he explains, was created 'li ta'arafu' — for mutual recognition and cooperation, not for division and tribalism. He firmly states that national or tribal pride has no standing in Islam: 'Indeed, the most noble of you in the sight of Allah is the most righteous.' Ibn Katheer then quotes the Prophet ﷺ's Farewell Sermon: 'O people, your Lord is One and your father is one. There is no superiority of an Arab over a non-Arab, nor a non-Arab over an Arab, nor a white person over a black person, nor a black person over a white — except through taqwa.' (Ahmad, Sahih). He notes the closing 'Aleem Khabeer' (Knowing, Expert): Allah knows the true level of taqwa in every heart — we cannot fake it or perform it. He sees what we cannot see of ourselves.",
    quranCom: "https://quran.com/49/13",
  },
  {
    ref: "Al-Mulk 67:1–2", surah: 67, ayah: 1,
    ar: "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ ﴿١﴾ الَّذِي خَلَقَ الْمَوْتَ وَالْحَيَاةَ لِيَبْلُوَكُمْ أَيُّكُمْ أَحْسَنُ عَمَلًا ۚ وَهُوَ الْعَزِيزُ الْغَفُورُ ﴿٢﴾",
    en: "Blessed is He in whose hand is dominion, and He is over all things competent — Who created death and life to test you as to which of you is best in deed. And He is the Exalted in Might, the Forgiving.",
    tafseer: "Ibn Katheer says the Prophet ﷺ called Surah Al-Mulk 'the defender' (al-mani'ah) — it defends its reciter from the punishment of the grave. (Tirmidhi 2891, Hasan). The surah opens with 'Tabaraka' — a word of supreme exaltation that occurs only in reference to Allah, implying His blessing is infinite, constant, and without diminishment. 'Khalaq al-mawta wal-hayah' — He created death and life — is the foundation of the Islamic philosophy of purpose. Ibn Katheer explains that death is listed before life because in Quranic order, death was created first (the default state) and life is the exception Allah granted. The purpose of this alternation: 'li yabluwakum' — to test you — and the criterion is not quantity of deeds (akthar) but quality (ahsan). Ibn Katheer cites Fudayl ibn Iyad: 'The most sincere and most correct.' A deed is 'best' when it is both sincerely for Allah and correctly performed according to the Sunnah — if either is missing, it falls short.",
    quranCom: "https://quran.com/67/1",
  },
  {
    ref: "Al-Inshirah 94:5–8", surah: 94, ayah: 5,
    ar: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٥﴾ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴿٦﴾ فَإِذَا فَرَغْتَ فَانصَبْ ﴿٧﴾ وَإِلَىٰ رَبِّكَ فَارْغَبْ ﴿٨﴾",
    en: "For indeed, with hardship will be ease. Indeed, with hardship will be ease. So when you have finished, then stand up for worship. And to your Lord direct your longing.",
    tafseer: "Ibn Katheer makes a crucial grammatical observation: 'al-'usr' (hardship) appears with the definite article (al) both times, making it the same, singular hardship. 'Yusr' (ease) appears indefinitely both times, making it two separate, different eases. He cites this to explain the famous principle: 'One hardship cannot overcome two eases.' This is not wishful thinking — it is a grammatical and theological guarantee from Allah. Ibn Katheer then explains the instruction: 'Fa-idha faraghta fansab' — when you finish one task, immediately engage in another. He notes this contradicts idleness: the believer's life should alternate between different forms of striving, never stagnating. 'Wa ila rabbika farghab' — direct your desire only to your Lord — Ibn Katheer says this completes the cycle: every relief you seek, every hope you carry, every longing you feel, should be directed ultimately to Allah. Not to people, not to circumstances, not to your own abilities.",
    quranCom: "https://quran.com/94/5",
  },
  {
    ref: "Al-Asr 103:1–3", surah: 103, ayah: 1,
    ar: "وَالْعَصْرِ ﴿١﴾ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ ﴿٢﴾ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ ﴿٣﴾",
    en: "By time — indeed, mankind is in loss, except for those who have believed and done righteous deeds and advised each other to truth and advised each other to patience.",
    tafseer: "Ibn Katheer records that Imam al-Shafi'i said: 'If Allah had revealed nothing to mankind except this surah, it would have been sufficient for them.' It is a complete roadmap of salvation in three verses. Ibn Katheer explains: Allah swears by al-'Asr (time itself, or Asr prayer time — the scholars have both opinions) to emphasise the weight of what follows. The human default state is 'khusr' — loss, deficit, diminishment — unless four conditions are met simultaneously: 1. Iman (belief in Allah and all He commanded), 2. Righteous deeds (consistent practice of worship and ethics), 3. Mutual enjoining of truth (not keeping Islam private but sharing, correcting, and reminding), 4. Mutual encouragement to patience (sustaining each other through difficulty). Ibn Katheer notes the word 'tawaasaw' (mutual enjoining) means this is a communal responsibility — the believer cannot be an island. One without the other three is insufficient. All four together constitute complete success.",
    quranCom: "https://quran.com/103/1",
  },
  {
    ref: "Al-Ikhlas 112:1–4", surah: 112, ayah: 1,
    ar: "قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾ اللَّهُ الصَّمَدُ ﴿٢﴾ لَمْ يَلِدْ وَلَمْ يُولَدْ ﴿٣﴾ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ ﴿٤﴾",
    en: "Say: He is Allah, the One. Allah, the Eternal Refuge. He neither begets nor was begotten. Nor is there to Him any equivalent.",
    tafseer: "Ibn Katheer opens with the hadith that this surah equals a third of the Quran (Bukhari 5013), explaining that the Quran covers three core topics — Allah's names and attributes, commands and prohibitions, and stories of previous nations — and Al-Ikhlas covers the first entirely. 'Ahad' (One) is stronger than 'wahid' (one) in Arabic — it means uniquely, absolutely, incomparably singular. 'Al-Samad' is one of the most debated words in tafseer; Ibn Katheer compiles the scholars' opinions: the one upon whom all creation depends while He depends on none; the one who does not eat or drink; the one whose lordship is complete. 'Lam yalid wa lam yoolad' — He does not beget and was not begotten — directly refutes both Christian claims about Isa (AS) and Arabian claims about Allah having daughters. 'Wa lam yakun lahu kufuwan ahad' — no equivalent, no comparable, no partner. Ibn Katheer emphasises: anyone who truly internalises this surah cannot commit shirk, because there is simply nothing comparable to Allah to associate with Him.",
    quranCom: "https://quran.com/112/1",
  },
];

// ── Dorar.net Hadith — deterministic daily rotation ──────────────────────────
// Each entry: a specific sharh (explanation) page on dorar.net plus metadata.
// The page URL is shown as a "Read full explanation on Dorar" link.
// IDs verified as valid sharh pages on dorar.net/hadith/sharh/[id]
const DORAR_HADITHS = [
  {
    ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى",
    en: "Actions are judged by intentions, and every person will have only what they intended.",
    source: "Sahih al-Bukhari 1 · Sahih Muslim 1907", narrator: "Umar ibn al-Khattab رضي الله عنه", grade: "Sahih",
    dorarId: 64107,
    summary: "One of the four hadith upon which all of Islamic fiqh revolves. Al-Nawawi said it is sufficient for a person to know Islam through this alone. An action done for Allah's sake earns full reward; the same action done for show earns nothing. The judge of deeds is the heart, not the body.",
  },
  {
    ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ",
    en: "The best of you are those who learn the Quran and teach it.",
    source: "Sahih al-Bukhari 5027", narrator: "Uthman ibn Affan رضي الله عنه", grade: "Sahih",
    dorarId: 36729,
    summary: "Al-Bukhari placed this in Kitab Fadha'il al-Quran. 'Learning' includes memorisation, tajweed, and tafseer. 'Teaching' encompasses all transmission — formal instruction, correction, or reciting to one's child. The one who recites with difficulty receives a double reward (Muslim 798).",
  },
  {
    ar: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ",
    en: "None of you truly believes until he loves for his brother what he loves for himself.",
    source: "Sahih al-Bukhari 13 · Sahih Muslim 45", narrator: "Anas ibn Malik رضي الله عنه", grade: "Sahih",
    dorarId: 2825,
    summary: "'Brother' includes all Muslims — men and women. Ibn Rajab extends it to all humanity in wishing guidance. This principle eliminates jealousy at its root: if you genuinely wish others what you wish yourself, envy has no foothold. The Quran says: 'The believers are but brothers.' (49:10).",
  },
  {
    ar: "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ",
    en: "Whoever believes in Allah and the Last Day should speak good or remain silent.",
    source: "Sahih al-Bukhari 6018 · Sahih Muslim 47", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 7398,
    summary: "Al-Nawawi called this one of the most comprehensive hadiths — sufficient for disciplining the tongue. 'Not a word does he utter but there is a watcher ready to record it.' (50:18). Silence itself is ibadah when speech would bring sin. The Prophet ﷺ warned that a careless word can cast a man into Hellfire (Bukhari 6478).",
  },
  {
    ar: "أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ",
    en: "The most beloved deeds to Allah are those done consistently, even if they are few.",
    source: "Sahih al-Bukhari 6465 · Sahih Muslim 783", narrator: "Aishah رضي الله عنها", grade: "Sahih",
    dorarId: 15913,
    summary: "Aishah (RA) said the Prophet ﷺ's own deeds were continuous (Muslim 746). Ibn Hajar explains: small consistent deeds keep the heart alive with Allah, while intense bursts followed by abandonment do not. One page of Quran daily is better than ten pages once a week. Allah says: 'So worship Him and be steadfast.' (19:65).",
  },
  {
    ar: "إِنَّ اللَّهَ لاَ يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ",
    en: "Allah does not look at your forms and wealth, but He looks at your hearts and deeds.",
    source: "Sahih Muslim 2564", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 52234,
    summary: "A tremendous equaliser: wealth, beauty, race — irrelevant to Allah. Taqwa and sincerity are the only currency. The Prophet ﷺ elevated Bilal (freed slave), Salman (Persian), Suhayb (Roman) to positions of honour. Ibn al-Qayyim: the heart's condition shapes every deed — a sound heart produces sound actions.",
  },
  {
    ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ",
    en: "Seeking knowledge is an obligation upon every Muslim.",
    source: "Ibn Majah 224 (Sahih — authenticated by al-Albani)", narrator: "Anas ibn Malik رضي الله عنه", grade: "Sahih",
    dorarId: 19706,
    summary: "The obligation is fard 'ayn for the knowledge every Muslim needs for their practice: prayer, fasting, honest dealing. Beyond that, collective obligations (fard kifayah) include scholarship, medicine, and all disciplines the Ummah requires. The Quran opens with 'Iqra!' and contains the root of 'ilm over 750 times.",
  },
  {
    ar: "حُفَّتِ الْجَنَّةُ بِالْمَكَارِهِ وَحُفَّتِ النَّارُ بِالشَّهَوَاتِ",
    en: "Paradise is surrounded by hardships, and Hellfire is surrounded by desires.",
    source: "Sahih Muslim 2822", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 29001,
    summary: "Ibn al-Qayyim in Madarij al-Salikin: the path to Paradise requires overcoming discomfort — waking for Fajr, controlling desires, spending in charity. The path to Hellfire is lined with pleasures. Every act of worship is a battle against the nafs, and every victory draws closer to Paradise.",
  },
  {
    ar: "كُنْ فِي الدُّنْيَا كَأَنَّكَ غَرِيبٌ أَوْ عَابِرُ سَبِيلٍ",
    en: "Be in this world as though you were a stranger or a wayfarer.",
    source: "Sahih al-Bukhari 6416", narrator: "Ibn Umar رضي الله عنه", grade: "Sahih",
    dorarId: 47822,
    summary: "Ibn Umar (RA) added: 'When evening comes, do not expect to live until morning.' This hadith is the foundation of Islamic zuhd (detachment from the dunya). A traveller packs only what they need for the journey — they don't build mansions at rest stops. True wealth is wealth of the heart (taqwa).",
  },
  {
    ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلاَّ مِنْ ثَلاَثَةٍ",
    en: "When a person dies, their deeds end except three: ongoing charity, beneficial knowledge, or a righteous child who prays for them.",
    source: "Sahih Muslim 1631", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 38944,
    summary: "Three investments whose returns extend beyond the grave. Sadaqah jariyah: masjid, well, tree, funded education. Knowledge that benefits: a book written, a student taught, a class established. The righteous child: the most personal — your own upbringing of them is returned to you. Plant seeds; share in every fruit.",
  },
  {
    ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ",
    en: "Whoever travels a path seeking knowledge, Allah will make easy for him a path to Paradise.",
    source: "Sahih Muslim 2699", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 41560,
    summary: "The 'path' is both literal — travel to a scholar — and metaphorical — the journey of study. Angels lower their wings for the seeker of knowledge. Ibn Abd al-Barr compiled an entire book on this virtue. The early Muslims would travel months to verify a single hadith. Reading, attending class, listening — all of this is this path.",
  },
  {
    ar: "الدِّينُ النَّصِيحَةُ",
    en: "The religion is sincere advice.",
    source: "Sahih Muslim 55", narrator: "Tamim al-Dari رضي الله عنه", grade: "Sahih",
    dorarId: 3902,
    summary: "One of the shortest hadith but among the most comprehensive. Al-Nawawi: nasiha to Allah means believing in Him truly; to His Book means reciting, understanding, and acting on it; to His Messenger means following his Sunnah; to Muslim leaders means obeying in goodness and advising in private; to the general Muslims means wishing them well, guiding them to benefit, removing harm from them.",
  },
  {
    ar: "اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ وَأَتْبِعِ السَّيِّئَةَ الْحَسَنَةَ تَمْحُهَا وَخَالِقِ النَّاسَ بِخُلُقٍ حَسَنٍ",
    en: "Fear Allah wherever you are. Follow a bad deed with a good one to erase it. And treat people with good character.",
    source: "Tirmidhi 1987 (Hasan Sahih)", narrator: "Abu Dharr and Mu'adh ibn Jabal رضي الله عنهما", grade: "Hasan Sahih",
    dorarId: 58803,
    summary: "Three complete principles in one hadith. (1) Taqwa is not location-specific — it is maintained in private as in public. (2) The mechanism of sin management: immediately follow any sin with a good deed. This is from Allah's mercy — He did not simply say 'don't sin' but gave us the tool of recovery. (3) Husn al-khuluq (good character) is the third pillar, completing worship of Allah with service to creation.",
  },
  {
    ar: "إِنَّ مِنْ أَحَبِّكُمْ إِلَيَّ وَأَقْرَبِكُمْ مِنِّي مَجْلِسًا يَوْمَ الْقِيَامَةِ أَحَاسِنَكُمْ أَخْلَاقًا",
    en: "The most beloved and closest to me in sitting on the Day of Resurrection are those best in character.",
    source: "Tirmidhi 2018 (Hasan)", narrator: "Jabir ibn Abdullah رضي الله عنه", grade: "Hasan",
    dorarId: 62100,
    summary: "Proximity to the Prophet ﷺ on the Day of Judgement is not determined by quantity of worship alone, but by the quality of character. The scholars note that good character — patience, truthfulness, generosity, gentleness — is the fruit of sound worship, not separate from it. It is not possible to have true taqwa while having poor character toward people.",
  },
  {
    ar: "مَنْ صَامَ رَمَضَانَ إِيمَانًا وَاحْتِسَابًا غُفِرَ لَهُ مَا تَقَدَّمَ مِنْ ذَنْبِهِ",
    en: "Whoever fasts Ramadan with faith and seeking reward, his previous sins will be forgiven.",
    source: "Sahih al-Bukhari 38 · Sahih Muslim 760", narrator: "Abu Hurayrah رضي الله عنه", grade: "Sahih",
    dorarId: 11280,
    summary: "Two conditions must accompany fasting: iman (genuine belief that this is commanded by Allah) and ihtisab (seeking the reward from Allah alone, not custom or social pressure). Meeting these two conditions earns the promise of complete forgiveness of past sins. The same formula applies to the Qiyam of Ramadan and Laylat al-Qadr.",
  },
];

// ── Aqeedah Al-Wasitiyyah — Daily Lessons ────────────────────────────────────
// Source: Al-Aqeedah Al-Wasitiyyah by Shaykh al-Islam Ibn Taymiyyah (661–728H)
// The clearest, most concise summary of Sunni aqeedah — written as a single fatwah
// Each lesson covers a principle from the text, supported by Quran and hadith proofs
const AQEEDAH_LESSONS = [
  {
    chapter: "Tawheed al-Uluhiyyah",
    chapterAr: "توحيد الألوهية",
    titleEn: "Singling Out Allah in All Acts of Worship",
    titleAr: "إفراد الله بالعبادة",
    sourceRef: "Al-Wasitiyyah, Opening Section",
    bookNote: "Ibn Taymiyyah opens Al-Wasitiyyah with this principle as the foundation of all religion.",
    quranicProof: {
      ar: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ",
      en: "And I did not create the jinn and mankind except to worship Me.",
      ref: "Adh-Dhariyat 51:56",
    },
    hadith: {
      ar: "حَقُّ اللَّهِ عَلَى الْعِبَادِ أَنْ يَعْبُدُوهُ وَلَا يُشْرِكُوا بِهِ شَيْئًا",
      en: "Allah's right over His servants is that they worship Him and associate nothing with Him.",
      source: "Sahih al-Bukhari 2856 · Sahih Muslim 30",
    },
    explanation: "Ibn Taymiyyah defines 'ibadah in Al-Wasitiyyah as: 'A comprehensive term for everything Allah loves and is pleased with — of statements and actions, inward and outward.' This means worship is not restricted to formal rituals but encompasses the orientation of the entire person toward Allah. The opposite — shirk — is to direct any act of worship (du'a, fear, hope, slaughter, vow) to other than Allah. Ibn Taymiyyah was explicit that even small acts of seeking intercession from the dead, or slaughtering for saints, fall under this prohibition regardless of the intention behind them.\n\nKEY POINT: The first testimony (La ilaha illallah) means: nothing deserves worship except Allah. Every act of worship directed at other than Allah is an act of shirk, regardless of the form it takes or the love the person claims.",
  },
  {
    chapter: "Al-Asma wa al-Sifat",
    chapterAr: "الأسماء والصفات",
    titleEn: "Allah's Names and Attributes — Without Likening or Negating",
    titleAr: "إثبات الأسماء والصفات بلا تشبيه ولا تعطيل",
    sourceRef: "Al-Wasitiyyah, Chapter on Attributes",
    bookNote: "The largest section of Al-Wasitiyyah — Ibn Taymiyyah's most careful treatment of the divine attributes.",
    quranicProof: {
      ar: "لَيْسَ كَمِثْلِهِ شَيْءٌ ۖ وَهُوَ السَّمِيعُ الْبَصِيرُ",
      en: "There is nothing like unto Him, and He is the All-Hearing, the All-Seeing.",
      ref: "Ash-Shura 42:11",
    },
    hadith: {
      ar: "يَنْزِلُ رَبُّنَا تَبَارَكَ وَتَعَالَى كُلَّ لَيْلَةٍ إِلَى السَّمَاءِ الدُّنْيَا",
      en: "Our Lord, blessed and exalted, descends every night to the lowest heaven...",
      source: "Sahih al-Bukhari 1145 · Sahih Muslim 758",
    },
    explanation: "Ibn Taymiyyah establishes in Al-Wasitiyyah the Salafi methodology on attributes: affirm what Allah affirmed for Himself, deny what He denied, and do not ask 'how.' The two deviations he warns against are: (1) Tashbih — likening Allah's attributes to creation ('His hand is like a human hand'), (2) Ta'til — negating the attributes altogether ('He has no real hand, it means His power'). The correct position: Allah has a Hand, a Face, He is above His Throne, He descends — all in a manner befitting His majesty, unlike anything created.\n\nKEY POINT: 'Bila kayf, bila tashbih' — without asking how, without likening. The Salaf affirmed these attributes without interpretation (ta'weel) that changes their meaning and without asking about their modality (kayf).",
  },
  {
    chapter: "Al-Iman bil-Qada wal-Qadar",
    chapterAr: "الإيمان بالقضاء والقدر",
    titleEn: "Belief in Allah's Decree — Its Four Levels",
    titleAr: "الإيمان بالقدر بمراتبه الأربع",
    sourceRef: "Al-Wasitiyyah, Chapter on Qadar",
    bookNote: "Ibn Taymiyyah systematises the four levels of belief in Qadar, countering both Jabr (compulsion) and Qadariyyah (denial of Allah's decree).",
    quranicProof: {
      ar: "إِنَّا كُلَّ شَيْءٍ خَلَقْنَاهُ بِقَدَرٍ",
      en: "Indeed, all things We created with predestination.",
      ref: "Al-Qamar 54:49",
    },
    hadith: {
      ar: "وَتُؤْمِنَ بِالْقَدَرِ خَيْرِهِ وَشَرِّهِ",
      en: "And you believe in divine decree — its good and its bad.",
      source: "Sahih Muslim 8 (Hadith Jibreel)",
    },
    explanation: "Ibn Taymiyyah in Al-Wasitiyyah outlines the four levels (maratib) of belief in Qadar that Ahlus-Sunnah affirm:\n\n1. AL-'ILM: Allah's knowledge is eternal and encompasses all things — past, present, and future — before creation existed.\n2. AL-KITABAH: Everything decreed was written in al-Lawh al-Mahfuz 50,000 years before the creation of heavens and earth (Sahih Muslim 2653).\n3. AL-MASHI'AH: Nothing occurs except by Allah's will — 'Wa ma tasha'una illa an yasha'allah' (81:29).\n4. AL-KHALQ: Allah created everything, including human actions — 'Wallahu khalaqakum wa ma ta'maloon' (37:96).\n\nTHE CURE for misusing Qadar as an excuse: the Prophet ﷺ said 'Take action — all will be made easy for what they were created for' (Bukhari 4949). Qadar is known after, not before. Act; then attribute the result to Allah.",
  },
  {
    chapter: "Ahl al-Sunnah wa al-Jama'ah",
    chapterAr: "أهل السنة والجماعة",
    titleEn: "The Saved Group — Their Definition and Methodology",
    titleAr: "الفرقة الناجية ومنهجها",
    sourceRef: "Al-Wasitiyyah, Introduction",
    bookNote: "Ibn Taymiyyah defines Ahlus-Sunnah by their methodology, not by a name or group affiliation.",
    quranicProof: {
      ar: "وَمَن يُشَاقِقِ الرَّسُولَ مِن بَعْدِ مَا تَبَيَّنَ لَهُ الْهُدَىٰ وَيَتَّبِعْ غَيْرَ سَبِيلِ الْمُؤْمِنِينَ نُوَلِّهِ مَا تَوَلَّىٰ",
      en: "Whoever opposes the Messenger after guidance has become clear and follows other than the path of the believers — We will give him what he chose.",
      ref: "An-Nisa 4:115",
    },
    hadith: {
      ar: "مَا أَنَا عَلَيْهِ وَأَصْحَابِي",
      en: "What I and my Companions are upon.",
      source: "Tirmidhi 2641 (Hasan) — defining the saved group",
    },
    explanation: "Ibn Taymiyyah writes in Al-Wasitiyyah that Ahlus-Sunnah wal-Jama'ah are those who hold to what the Prophet ﷺ and his Companions were upon, without addition or subtraction. Their distinguishing marks:\n\n1. They follow the Quran and authentic Sunnah as interpreted by the Salaf (the first three generations).\n2. They do not make takfeer (excommunication) of Muslims based on sins without conditions met.\n3. They give scholars their due but do not raise any scholar above the evidence.\n4. They accept the ijma' (consensus) of the Companions as binding.\n5. They love all the Companions of the Prophet ﷺ, believe they are all just witnesses, and speak of them with respect.\n\nKEY POINT: Ahlus-Sunnah is not a faction or political group — it is a methodology. Anyone who holds to the Quran and Sunnah as the Salaf understood it belongs to it, regardless of their nationality, madhab, or century.",
  },
  {
    chapter: "Al-Iman bil-Akhirah",
    chapterAr: "الإيمان بالآخرة",
    titleEn: "Belief in the Hereafter — What Must Be Believed",
    titleAr: "الإيمان باليوم الآخر وما فيه",
    sourceRef: "Al-Wasitiyyah, Chapter on Eschatology",
    bookNote: "Ibn Taymiyyah lists belief in the specifics of the Hereafter as binding upon every Muslim.",
    quranicProof: {
      ar: "وَأَنَّ السَّاعَةَ آتِيَةٌ لَّا رَيْبَ فِيهَا وَأَنَّ اللَّهَ يَبْعَثُ مَن فِي الْقُبُورِ",
      en: "And that the Hour is coming — no doubt about it — and that Allah will resurrect those in the graves.",
      ref: "Al-Hajj 22:7",
    },
    hadith: {
      ar: "إِذَا وُضِعَ الْعَبْدُ فِي قَبْرِهِ وَتَوَلَّى عَنْهُ أَصْحَابُهُ سَمِعَ قَرْعَ نِعَالِهِمْ",
      en: "When the servant is placed in his grave and his companions depart, he hears the tapping of their sandals...",
      source: "Sahih al-Bukhari 1338 · Sahih Muslim 2870",
    },
    explanation: "Ibn Taymiyyah specifies in Al-Wasitiyyah what must be believed regarding the Hereafter:\n\n1. THE GRAVE: Punishment and blessing of the grave are real — affirmed by Quran ('We will punish them twice' 9:101) and numerous sahih hadiths. Denying it contradicts Ahlus-Sunnah.\n2. THE RESURRECTION: All of creation will be resurrected bodily — same body, reconstituted — on the Day of Judgement.\n3. THE SCALES (Mizan): Deeds will be weighed on actual scales ('Fa-man thaqulat mawazinuhu...' 7:8).\n4. THE SIRAT: A bridge over Hellfire that every person must cross — Muslims at different speeds based on their deeds.\n5. SHAFA'AH: Intercession is real and belongs ultimately to Allah — but granted by His permission to the Prophet ﷺ, then other prophets, then scholars and martyrs.\n6. JANNAH AND NAAR: Both are real, currently existing, and eternal for their inhabitants.\n\nIMPORTANT: Allegorising or denying any of these six is a deviation from the way of Ahlus-Sunnah.",
  },
  {
    chapter: "Muhabbat al-Sahabah",
    chapterAr: "محبة الصحابة",
    titleEn: "Love of the Companions — A Principle of Ahlus-Sunnah",
    titleAr: "محبة أصحاب النبي ﷺ وسلامة الصدر لهم",
    sourceRef: "Al-Wasitiyyah, Chapter on the Companions",
    bookNote: "Ibn Taymiyyah devotes a dedicated chapter to the position of Ahlus-Sunnah toward the Companions.",
    quranicProof: {
      ar: "وَالسَّابِقُونَ الْأَوَّلُونَ مِنَ الْمُهَاجِرِينَ وَالْأَنصَارِ وَالَّذِينَ اتَّبَعُوهُم بِإِحْسَانٍ رَّضِيَ اللَّهُ عَنْهُمْ وَرَضُوا عَنْهُ",
      en: "The first forerunners — the Muhajirin and the Ansar — and those who followed them in good conduct: Allah is pleased with them and they are pleased with Him.",
      ref: "At-Tawbah 9:100",
    },
    hadith: {
      ar: "لَا تَسُبُّوا أَصْحَابِي فَلَوْ أَنَّ أَحَدَكُمْ أَنْفَقَ مِثْلَ أُحُدٍ ذَهَبًا مَا بَلَغَ مُدَّ أَحَدِهِمْ وَلَا نَصِيفَهُ",
      en: "Do not revile my Companions. If one of you spent gold equal to Mount Uhud, it would not reach the value of a handful of one of them, nor even half of it.",
      source: "Sahih al-Bukhari 3673 · Sahih Muslim 2540",
    },
    explanation: "Ibn Taymiyyah is emphatic in Al-Wasitiyyah: Ahlus-Sunnah maintain a clean heart (salamat al-sadr) toward all Companions. This means:\n\n1. They love them all — Abu Bakr, Umar, Uthman, Ali and the rest — without making any of them infallible.\n2. They accept the historical disputes (fitnah) between Companions as ijtihad — mistakes of scholars who receive one reward even when wrong.\n3. They do not revile any Companion, regardless of political allegiance.\n4. They accept the hadith narrated by Companions as authentic transmission.\n5. They believe the order of virtue among them is the order of the khilafah: Abu Bakr > Umar > Uthman > Ali.\n\nNULLIFIER OF THIS PRINCIPLE: Cursing Abu Bakr, Umar, or Aishah (RA) is considered by the scholars of Ahlus-Sunnah a grave innovation. Cursing all of them is considered a sign of deviation from the path.",
  },
  {
    chapter: "Al-'Uqubat wa al-Thawab",
    chapterAr: "العقوبات والثواب",
    titleEn: "Punishment and Reward — The Just Balance",
    titleAr: "عدل الله في الثواب والعقاب",
    sourceRef: "Al-Wasitiyyah, Chapter on Justice",
    bookNote: "Ibn Taymiyyah addresses the theological question of Allah's justice in punishment and reward.",
    quranicProof: {
      ar: "مَّن جَاءَ بِالْحَسَنَةِ فَلَهُ عَشْرُ أَمْثَالِهَا ۖ وَمَن جَاءَ بِالسَّيِّئَةِ فَلَا يُجْزَىٰ إِلَّا مِثْلَهَا وَهُمْ لَا يُظْلَمُونَ",
      en: "Whoever comes with a good deed will have ten times the like thereof, and whoever comes with an evil deed will not be recompensed except the like thereof — and they will not be wronged.",
      ref: "Al-An'am 6:160",
    },
    hadith: {
      ar: "مَنْ هَمَّ بِحَسَنَةٍ فَلَمْ يَعْمَلْهَا كُتِبَتْ لَهُ حَسَنَةً",
      en: "Whoever intends to do a good deed but does not do it, a full good deed is written for him.",
      source: "Sahih al-Bukhari 6491 · Sahih Muslim 131",
    },
    explanation: "Ibn Taymiyyah explains that Allah's justice in reward and punishment is perfectly calibrated — and always tilted toward mercy for the believer:\n\nGOOD DEEDS: One intention earns one reward even if not acted on. One deed earns ten rewards minimum, up to 700-fold and beyond (2:261). Allah multiplies without account for whom He wills.\n\nBAD DEEDS: One intention NOT acted on: no sin is recorded. One bad deed acted on: only one sin. The intention to sin plus the deed: one sin only, not two.\n\nKEY POINT from the hadith: 'I (Allah) am as My servant thinks of Me — so let him think well of Me.' (Bukhari 7405). Ibn Taymiyyah says the believer should always hold husn al-zann (good expectation) of Allah's mercy while maintaining khawf (fear) of His punishment. The balance between raja' (hope) and khawf (fear) is a sign of sound aqeedah.",
  },
  {
    chapter: "Al-Wilayah wa al-'Adawah",
    chapterAr: "الولاية والعداوة",
    titleEn: "Alliance and Enmity — Al-Wala wal-Bara",
    titleAr: "الولاء والبراء في ضوء الكتاب والسنة",
    sourceRef: "Al-Wasitiyyah, Chapter on Loyalty",
    bookNote: "Ibn Taymiyyah addresses this principle carefully, distinguishing between what is religious obligation and what is natural human interaction.",
    quranicProof: {
      ar: "لَّا يَتَّخِذِ الْمُؤْمِنُونَ الْكَافِرِينَ أَوْلِيَاءَ مِن دُونِ الْمُؤْمِنِينَ",
      en: "Believers should not take disbelievers as awliya (intimate allies) instead of believers.",
      ref: "Aal-Imran 3:28",
    },
    hadith: {
      ar: "أَوْثَقُ عُرَى الْإِيمَانِ الْحُبُّ فِي اللَّهِ وَالْبُغْضُ فِي اللَّهِ",
      en: "The strongest handle of faith is to love for Allah's sake and to hate for Allah's sake.",
      source: "Musnad Ahmad (Sahih — authenticated by al-Albani)",
    },
    explanation: "Ibn Taymiyyah clarifies in Al-Wasitiyyah that al-wala (loyalty/alliance) and al-bara (disassociation) operate at different levels:\n\nPRINCIPLE: A Muslim's deepest loyalty is to Allah, His Messenger, and the believers. This is non-negotiable and cannot be replaced by nationality, tribe, or family.\n\nPERMITTED: Fair treatment, justice, and basic courtesy to non-Muslims who do not fight Muslims. Allah says: 'Allah does not forbid you from those who do not fight you on account of religion and do not expel you — to deal with them justly.' (60:8). The Prophet ﷺ himself dealt kindly with many non-Muslims.\n\nFORBIDDEN: Taking them as awliya (intimate allies) in matters of religion — sharing secrets of the Muslims, helping them against Muslims, or showing them as the primary source of trust over Muslims.\n\nIMPORTANT: This is not a call to hatred of individuals. It is a call to clarity about where ultimate loyalty lies — and that it lies with Allah.",
  },
];
// ── Seerah — The Sealed Nectar (Ar-Raheeq Al-Makhtum)
// Sequential episodes imported from SeerahData.tsx
// In component: const dailySeerah = SEERAH_EPISODES[doy % SEERAH_EPISODES.length];
// Add this import at the top of your final IslamicDailyFeed.tsx:
// import { SEERAH_EPISODES } from './SeerahData';



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

// ── Islamic Events (Hijri-based) ──────────────────────────────────────────
const ISLAMIC_EVENTS = [
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

// ─── TAWHEED LESSON DATA ────────────────────────────────────────────────────
interface TawheedLesson {
  module: string;
  moduleBg: string; moduleBadge: string; moduleBorder: string;
  titleEn: string; titleAr: string; subtitleEn: string;
  quranicProof: { ar: string; en: string; ref: string };
  hadith: { ar: string; en: string; source: string };
  explanation: string;
}

const TAWHEED_LESSONS: TawheedLesson[] = [
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

// ── Static curated Islamic news ──────────────────────────────────────────────
interface NewsItem { title: string; link: string; description: string; thumbnail: string; pubDate: string; }
const STATIC_NEWS: NewsItem[] = [
  { title: "The Importance of Seeking Knowledge in Islam", link: "https://islamqa.info/en/answers/10471", description: "Islam places great emphasis on education. The Prophet ﷺ said: 'Seeking knowledge is an obligation upon every Muslim.'", thumbnail: "", pubDate: new Date().toISOString() },
  { title: "Understanding Tawakkul: True Reliance on Allah", link: "https://productivemuslim.com/tawakkul/", description: "Tawakkul means placing complete trust in Allah while taking all necessary means. It is not passivity but active engagement paired with sincere reliance.", thumbnail: "", pubDate: new Date(Date.now()-86400000).toISOString() },
  { title: "The Virtues of Dhikr and Remembrance of Allah", link: "https://islamqa.info/en/answers/9917", description: "Allah says: 'Verily, in the remembrance of Allah do hearts find rest.' (13:28). Regular dhikr keeps the heart alive and connected to its Creator.", thumbnail: "", pubDate: new Date(Date.now()-172800000).toISOString() },
  { title: "How to Make the Most of Your Time as a Muslim Student", link: "https://productivemuslim.com/time-management-students/", description: "Time is one of the greatest blessings. Learning to manage it — balancing worship, study, and rest — is itself an act of gratitude.", thumbnail: "", pubDate: new Date(Date.now()-259200000).toISOString() },
  { title: "The Role of Patience (Sabr) in a Muslim's Life", link: "https://islamqa.info/en/answers/9427", description: "The Quran mentions sabr over 90 times. Allah is with the patient: 'Indeed, Allah is with the patient.' (2:153).", thumbnail: "", pubDate: new Date(Date.now()-345600000).toISOString() },
];

type TabId = "quran" | "hadith" | "aqeedah" | "seerah" | "event" | "news";
interface Props { language?: string; }

// ═══════════════════════════════════════════════════════════════════════════
const IslamicDailyFeed: React.FC<Props> = ({ language = "en" }) => {
  const doy   = dayOfYear();
  const today = new Date();

  const dailyVerse   = DAILY_VERSES[doy % DAILY_VERSES.length];
  const dailyHadith  = DORAR_HADITHS[doy % DORAR_HADITHS.length];
  const dailyAqeedah = AQEEDAH_LESSONS[doy % AQEEDAH_LESSONS.length];
  const dailySeerah  = SEERAH_EPISODES[doy % SEERAH_EPISODES.length]; // 57 sequential episodes

  const upcomingEvent = (() => {
    for (let i = 0; i < 14; i++) {
      const check = new Date(today.getTime() + i * 86_400_000);
      const { day, month } = getHijriNumeric(check);
      const ev = ISLAMIC_EVENTS.find(e => e.hijriMonth === month && Math.abs(e.hijriDay - day) <= (e.daysWindow ?? 3));
      if (ev) return { event: ev, daysAway: i };
    }
    return { event: ISLAMIC_EVENTS[doy % ISLAMIC_EVENTS.length], daysAway: -1 };
  })();

  const TABS_ORDER: TabId[] = ["quran","hadith","aqeedah","seerah","event","news"];
  const [activeTab, setActiveTab] = useState<TabId>("quran");
  const [news,      setNews]      = useState<NewsItem[]>([]);
  const [newsLoad,  setNewsLoad]  = useState(false);
  const [newsError, setNewsError] = useState(false);
  const [aqExp,     setAqExp]     = useState(false);

  const handleTabClick = (id: TabId) => {
    setActiveTab(id);
  };

  useEffect(() => { setAqExp(false); }, [activeTab]);

  // News fetch (unchanged)
  useEffect(() => {
    if (activeTab !== "news" || news.length > 0 || newsLoad) return;
    setNewsLoad(true); setNewsError(false);
    const RSS_FEEDS = ["https://muslimmatters.org/feed/", "https://productivemuslim.com/feed/", "https://aboutislam.net/feed/"];
    (async () => {
      for (const feed of RSS_FEEDS) {
        try {
          const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 6000);
          const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&count=5`, { signal: ctrl.signal });
          clearTimeout(timer); if (!r.ok) continue;
          const d = await r.json();
          if (d.status === "ok" && d.items?.length > 0) {
            setNews(d.items.map((it: any) => ({ title: (it.title||"").replace(/&#\d+;/g,"").replace(/&amp;/g,"&").trim(), link: it.link||"#", description: (it.description||"").replace(/<[^>]*>/g,"").slice(0,140).trim()+"…", thumbnail: it.thumbnail||it.enclosure?.link||"", pubDate: it.pubDate||"" })));
            setNewsLoad(false); return;
          }
        } catch {}
      }
      setNews(STATIC_NEWS); setNewsLoad(false);
    })();
  }, [activeTab]);

  const t = (en: string, ar: string) => language === "ar" ? ar : en;
  const relDate = (s: string) => { try { const d = Math.floor((Date.now()-new Date(s).getTime())/86400000); return d===0?"Today":d===1?"Yesterday":`${d}d ago`; } catch { return ""; } };

  const TABS: { id: TabId; en: string; ar: string; Icon: any; color: string }[] = [
    { id: "quran",   en: "Quran",   ar: "قرآن",   Icon: BookOpen,     color: "#b7791f"  },
    { id: "hadith",  en: "Hadith",  ar: "حديث",   Icon: BookMarked,   color: DARK_GREEN },
    { id: "aqeedah", en: "Aqeedah", ar: "عقيدة",  Icon: Shield,       color: "#6b21a8"  },
    { id: "seerah",  en: "Seerah",  ar: "سيرة",   Icon: ScrollText,   color: AMBER      },
    { id: "event",   en: "Events",  ar: "مناسبة", Icon: CalendarDays, color: MID_GREEN  },
    { id: "news",    en: "News",    ar: "أخبار",  Icon: Newspaper,    color: "#1e3a5f"  },
  ];

  const outerCard: React.CSSProperties = { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 20, boxShadow: "0 2px 16px rgba(0,0,0,.06)", overflow: "hidden" };

  return (
    <div>
      <div style={outerCard}>

        {/* ── Tab strip ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
          {TABS.map(({ id, en, ar, Icon, color }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => handleTabClick(id)} style={{ flex:1, padding:"12px 4px", border:"none", cursor:"pointer", background: active?"#fff":"transparent", borderBottom: active?`2.5px solid ${color}`:"2.5px solid transparent", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all .15s" }}>
                <Icon style={{ width:16, height:16, color: active?color:TEXT_LIGHT }} />
                <span style={{ fontSize:10, fontWeight: active?800:500, color: active?color:TEXT_LIGHT }}>{t(en, ar)}</span>
              </button>
            );
          })}
        </div>

        {/* ══ QURAN TAB — Full verse + Tafseer Ibn Katheer ══════════════ */}
        {activeTab === "quran" && (
          <div>
            {/* Header gradient */}
            <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 100%)`, padding: "22px 20px 24px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:16 }}>
                <Star style={{ width:13, height:13, color:GOLD, fill:GOLD }} />
                <span style={{ fontSize:11, fontWeight:800, color:GOLD, letterSpacing:"0.06em", fontFamily:"'Playfair Display',serif" }}>
                  {t("Daily Quranic Verse", "آية اليوم")}
                </span>
                <Star style={{ width:13, height:13, color:GOLD, fill:GOLD }} />
              </div>

              {/* Reference badge */}
              <div style={{ textAlign:"center", marginBottom:14 }}>
                <span style={{ fontSize:10, fontWeight:700, color:GOLD, background:"rgba(201,168,76,0.18)", border:"1px solid rgba(201,168,76,0.35)", borderRadius:20, padding:"3px 12px" }}>
                  {dailyVerse.ref}
                </span>
              </div>

              {/* Arabic text */}
              <div style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${GOLD}33`, borderRadius:16, padding:"18px 16px", textAlign:"center", backdropFilter:"blur(6px)" }}>
                <p style={{ fontFamily:"'Amiri Quran','Amiri',serif", fontSize:22, lineHeight:2.3, color:"#fff", margin:"0 0 14px", direction:"rtl" }}>
                  {dailyVerse.ar}
                </p>
                <div style={{ width:40, height:1.5, background:GOLD, margin:"0 auto 14px", borderRadius:2, opacity:0.7 }} />
                <p style={{ fontSize:12.5, fontStyle:"italic", color:"rgba(255,255,255,0.85)", margin:0, lineHeight:1.65 }}>
                  "{dailyVerse.en}"
                </p>
              </div>
            </div>

            {/* Tafseer Ibn Katheer section */}
            <div style={{ padding:"16px 20px 6px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <div style={{ width:3, height:16, background:GOLD, borderRadius:2 }} />
                <span style={{ fontSize:11, fontWeight:800, color:TEXT_MED, fontFamily:"'Playfair Display',serif" }}>
                  {t("Tafseer Ibn Katheer", "تفسير ابن كثير")}
                </span>
              </div>
              <p style={{ fontSize:12.5, lineHeight:1.88, color:TEXT_DARK, margin:"0 0 18px" }}>
                {dailyVerse.tafseer}
              </p>
            </div>
          </div>
        )}

        {/* ══ HADITH TAB — Dorar.net daily ══════════════════════════════ */}
        {activeTab === "hadith" && (
          <div>
            {/* Header */}
            <div style={{ background:`linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 100%)`, padding:"22px 20px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <BookMarked style={{ width:13, height:13, color:GOLD }} />
                  <span style={{ fontSize:11, fontWeight:800, color:GOLD, letterSpacing:"0.06em", fontFamily:"'Playfair Display',serif" }}>
                    {t("Hadith of the Day","حديث اليوم")}
                  </span>
                </div>
                <span style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,.55)", background:"rgba(255,255,255,.1)", border:"1px solid rgba(255,255,255,.15)", borderRadius:20, padding:"3px 9px" }}>
                  {dailyHadith.grade}
                </span>
              </div>

              {/* Arabic text */}
              <p style={{ fontFamily:"'Scheherazade New','Amiri',serif", fontSize:20, lineHeight:2.1, color:"#fff", textAlign:"center", direction:"rtl", margin:"0 0 14px", textShadow:"0 2px 8px rgba(0,0,0,.3)" }}>
                {dailyHadith.ar}
              </p>
              <div style={{ width:40, height:1.5, background:GOLD, margin:"0 auto 14px", borderRadius:2, opacity:.8 }} />
              <p style={{ fontSize:13, lineHeight:1.75, fontStyle:"italic", color:"rgba(255,255,255,.9)", textAlign:"center", margin:"0 0 14px" }}>
                "{dailyHadith.en}"
              </p>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <span style={{ fontSize:11, fontWeight:700, color:GOLD_LIGHT }}>{dailyHadith.source}</span>
                <span style={{ fontSize:10, color:"rgba(255,255,255,.45)" }}>{t("Narrated by","عن")} {dailyHadith.narrator}</span>
              </div>
            </div>

            {/* Summary + Dorar link */}
            <div style={{ padding:"16px 20px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <div style={{ width:3, height:16, background:GOLD, borderRadius:2 }} />
                <span style={{ fontSize:11, fontWeight:800, color:TEXT_MED, fontFamily:"'Playfair Display',serif" }}>
                  {t("Explanation & Evidence","الشرح والأدلة")}
                </span>
              </div>
              <p style={{ fontSize:12.5, lineHeight:1.85, color:TEXT_DARK, margin:"0 0 18px" }}>
                {dailyHadith.summary}
              </p>
            </div>
          </div>
        )}

        {/* ══ AQEEDAH TAB — Al-Wasitiyyah (Ibn Taymiyyah) ══════════════ */}
        {activeTab === "aqeedah" && (
          <div>
            {/* Header */}
            <div style={{ background:"linear-gradient(135deg, #1e0533 0%, #3b0764 100%)", padding:"18px 20px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <Shield style={{ width:13, height:13, color:GOLD }} />
                  <span style={{ fontSize:11, fontWeight:800, color:GOLD, letterSpacing:"0.06em", fontFamily:"'Playfair Display',serif" }}>
                    {t("Aqeedah of the Day","عقيدة اليوم")}
                  </span>
                </div>
                {/* Book badge */}
                <span style={{ fontSize:9, fontWeight:700, color:"#e9d5ff", background:"rgba(233,213,255,.12)", border:"1px solid rgba(233,213,255,.2)", borderRadius:20, padding:"3px 9px" }}>
                  {dailyAqeedah.chapterAr}
                </span>
              </div>

              {/* Source line */}
              <p style={{ fontSize:10, color:"rgba(255,255,255,.45)", margin:"0 0 12px", fontStyle:"italic" }}>
                {dailyAqeedah.sourceRef} · {t("Al-Aqeedah Al-Wasitiyyah — Ibn Taymiyyah (d. 728H)","العقيدة الواسطية — ابن تيمية")}
              </p>

              {/* Title */}
              <h3 style={{ fontSize:15, fontWeight:900, color:"#fff", margin:"0 0 4px", fontFamily:"'Playfair Display',serif", lineHeight:1.3 }}>
                {dailyAqeedah.titleEn}
              </h3>
              <p dir="rtl" style={{ fontFamily:"'Scheherazade New','Amiri',serif", fontSize:17, lineHeight:1.8, color:GOLD_LIGHT, margin:"0 0 6px", textAlign:"center" }}>
                {dailyAqeedah.titleAr}
              </p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.6)", margin:0, fontStyle:"italic" }}>
                {dailyAqeedah.bookNote}
              </p>
            </div>

            {/* Quranic proof */}
            <div style={{ background:"#f0fff4", borderBottom:"1px solid #c6e6c6", padding:"14px 20px" }}>
              <div style={{ fontSize:10, fontWeight:800, color:MID_GREEN, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                <span>📖</span>{t("Quranic Proof","الدليل القرآني")}
              </div>
              <p dir="rtl" style={{ fontFamily:"'Scheherazade New','Amiri Quran','Amiri',serif", fontSize:19, lineHeight:2.1, color:DARK_GREEN, textAlign:"center", margin:"0 0 8px" }}>
                {dailyAqeedah.quranicProof.ar}
              </p>
              <p style={{ fontSize:11, color:"#276749", fontStyle:"italic", textAlign:"center", margin:"0 0 4px", lineHeight:1.6 }}>
                "{dailyAqeedah.quranicProof.en}"
              </p>
              <p style={{ fontSize:11, fontWeight:700, color:GOLD, textAlign:"center", margin:0 }}>
                — {dailyAqeedah.quranicProof.ref}
              </p>
            </div>

            {/* Hadith evidence */}
            <div style={{ background:AMBER_BG, borderBottom:`1px solid #ffe082`, padding:"14px 20px" }}>
              <div style={{ fontSize:10, fontWeight:800, color:AMBER, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                <span>📜</span>{t("Hadith Evidence","الدليل من السنة")}
              </div>
              <p dir="rtl" style={{ fontFamily:"'Scheherazade New','Amiri',serif", fontSize:15, lineHeight:2, color:"#5d4037", textAlign:"center", margin:"0 0 6px" }}>
                {dailyAqeedah.hadith.ar}
              </p>
              <p style={{ fontSize:11, color:"#7a6030", fontStyle:"italic", textAlign:"center", margin:"0 0 3px" }}>
                "{dailyAqeedah.hadith.en}"
              </p>
              <p style={{ fontSize:10, fontWeight:700, color:AMBER, textAlign:"center", margin:0 }}>
                — {dailyAqeedah.hadith.source}
              </p>
            </div>

            {/* Explanation expand */}
            <div style={{ padding:"12px 20px 16px" }}>
              <button onClick={() => setAqExp(v => !v)} style={{ width:"100%", background: aqExp?"#f3e8ff":"#faf5ff", border:"1px solid #e9d5ff", borderRadius:10, padding:"10px 14px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#6b21a8" }}>
                  {aqExp ? t("Hide Explanation","إخفاء الشرح") : t("Show Explanation from Al-Wasitiyyah ↓","عرض الشرح من الواسطية ↓")}
                </span>
                {aqExp
                  ? <ChevronUp  style={{ width:14, height:14, color:"#6b21a8" }} />
                  : <ChevronDown style={{ width:14, height:14, color:"#6b21a8" }} />
                }
              </button>
              {aqExp && (
                <div style={{ marginTop:10, background:"#faf5ff", borderRadius:12, border:"1px solid #e9d5ff", padding:"14px 16px" }}>
                  {dailyAqeedah.explanation.split("\n\n").map((para: string, i: number) => {
                    const isKey  = /^(KEY POINT|IMPORTANT|NULLIFIER|PRINCIPLE|THE CURE|CONDITIONS|PERMITTED|FORBIDDEN)/.test(para);
                    const isList = para.startsWith("1.");
                    return (
                      <p key={i} style={{
                        margin: i===0 ? 0 : "10px 0 0",
                        fontSize:12.5, lineHeight:1.78,
                        color: isKey ? "#92400e" : "#374151",
                        fontWeight: isKey ? 600 : 400,
                        background: isKey ? "rgba(146,64,14,.04)" : "transparent",
                        borderRadius: isKey ? 6 : 0,
                        borderLeft: isKey ? "3px solid #c9a84c" : "none",
                        padding: isKey ? "6px 6px 6px 10px" : "0",
                        whiteSpace: isList ? "pre-line" : "normal",
                      }}>
                        {para}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SEERAH TAB ════════════════════════════════════════════════ */}
        {activeTab === "seerah" && (
          <div style={{ background:AMBER_BG }}>
            {/* Book source header */}
            <div style={{ background:"#92400e", padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <ScrollText style={{ width:12, height:12, color:GOLD_LIGHT }} />
                <span style={{ fontSize:10, fontWeight:700, color:GOLD_LIGHT, letterSpacing:"0.05em" }}>
                  {t("Ar-Raheeq Al-Makhtum","الرحيق المختوم")}
                </span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:9, color:"rgba(255,255,255,0.6)" }}>
                  {t("Episode","الحلقة")}
                </span>
                <span style={{ fontSize:11, fontWeight:800, color:GOLD_LIGHT }}>
                  {(dailySeerah as any).episode ?? ""} / 57
                </span>
              </div>
            </div>

            <div style={{ padding:"16px 20px 0" }}>
              {/* Year badge */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <div style={{ background:`${AMBER}18`, border:`1px solid ${AMBER}40`, borderRadius:20, padding:"3px 10px" }}>
                  <span style={{ fontSize:9, fontWeight:700, color:AMBER }}>{(dailySeerah as any).year ?? ""}</span>
                </div>
                {/* Progress dots */}
                <div style={{ display:"flex", gap:3, flexWrap:"wrap", flex:1 }}>
                  {Array.from({length:57}).map((_,i) => (
                    <div key={i} style={{ width:6, height:6, borderRadius:"50%",
                      background: i < ((dailySeerah as any).episode ?? 1) ? AMBER : `${AMBER}30`,
                      flexShrink:0
                    }} />
                  ))}
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:14 }}>
                <div style={{ flexShrink:0, marginTop:6 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:AMBER, boxShadow:`0 0 0 3px ${AMBER}33` }} />
                </div>
                <div>
                  <h3 style={{ fontSize:15, fontWeight:900, color:TEXT_DARK, margin:"0 0 3px", fontFamily:"'Playfair Display',serif", lineHeight:1.3 }}>
                    {dailySeerah.title}
                  </h3>
                  <p style={{ fontSize:12, color:AMBER, margin:0, fontFamily:"'Scheherazade New','Amiri',serif", direction:"rtl" }}>
                    {dailySeerah.titleAr}
                  </p>
                </div>
              </div>
            </div>
            <div style={{ marginLeft:20, marginRight:20, borderLeft:`2px solid ${AMBER}30`, paddingLeft:14, paddingBottom:20 }}>
              <p style={{ fontSize:12.5, lineHeight:1.9, color:"#44200a", margin:0, whiteSpace:"pre-line" }}>
                {dailySeerah.content}
              </p>
            </div>
          </div>
        )}

        {/* ══ EVENTS TAB ════════════════════════════════════════════════ */}
        {activeTab === "event" && (() => {
          const { event, daysAway } = upcomingEvent;
          return (
            <div>
              <div style={{ background:`linear-gradient(135deg, ${DARK_GREEN} 0%, #1a5c35 100%)`, padding:"18px 20px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <CalendarDays style={{ width:13, height:13, color:GOLD }} />
                    <span style={{ fontSize:11, fontWeight:800, color:GOLD, letterSpacing:"0.05em", fontFamily:"'Playfair Display',serif" }}>
                      {t("Islamic Events","مناسبة إسلامية")}
                    </span>
                  </div>
                  {daysAway===0 && <span style={{ fontSize:9, fontWeight:800, color:DARK_GREEN, background:GOLD, borderRadius:20, padding:"3px 10px" }}>{t("TODAY ✨","اليوم ✨")}</span>}
                  {daysAway===1 && <span style={{ fontSize:9, fontWeight:700, color:GOLD, background:"rgba(201,168,76,.18)", border:"1px solid rgba(201,168,76,.35)", borderRadius:20, padding:"3px 10px" }}>{t("Tomorrow","غداً")}</span>}
                  {daysAway>1&&daysAway<14 && <span style={{ fontSize:9, fontWeight:700, color:GOLD, background:"rgba(201,168,76,.14)", border:"1px solid rgba(201,168,76,.3)", borderRadius:20, padding:"3px 10px" }}>{t(`In ${daysAway} days`,`خلال ${daysAway} أيام`)}</span>}
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:34, marginBottom:8 }}>{event.emoji}</div>
                  <h3 style={{ fontSize:17, fontWeight:900, color:"#fff", margin:"0 0 6px", fontFamily:"'Playfair Display',serif" }}>{event.name}</h3>
                  <p style={{ fontFamily:"'Scheherazade New','Amiri',serif", fontSize:20, color:GOLD_LIGHT, margin:0, direction:"rtl", lineHeight:1.6 }}>{event.nameAr}</p>
                </div>
              </div>
              <div style={{ padding:"18px 20px 20px" }}>
                <p style={{ fontSize:12.5, lineHeight:1.9, color:TEXT_DARK, margin:0, whiteSpace:"pre-line" }}>
                  {event.writeup}
                </p>
              </div>
            </div>
          );
        })()}

        {/* ══ NEWS TAB ══════════════════════════════════════════════════ */}
        {activeTab === "news" && (
          <div style={{ padding:"16px 16px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <Newspaper style={{ width:13, height:13, color:"#1e3a5f" }} />
                <span style={{ fontSize:11, fontWeight:800, color:"#1e3a5f", fontFamily:"'Playfair Display',serif" }}>
                  {t("Islamic News","أخبار إسلامية")}
                </span>
              </div>
              <button onClick={() => { setNewsError(false); setNews([]); }} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:10, color:TEXT_MED, padding:0 }}>
                <RefreshCw style={{ width:11, height:11 }} />{t("Refresh","تحديث")}
              </button>
            </div>
            {newsLoad && (
              <div style={{ padding:"28px 0", textAlign:"center" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", border:`3px solid ${DARK_GREEN}`, borderTopColor:"transparent", animation:"idf-spin .7s linear infinite", margin:"0 auto 10px" }} />
                <span style={{ fontSize:11, color:TEXT_LIGHT }}>{t("Loading…","جاري التحميل…")}</span>
                <style>{`@keyframes idf-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {newsError && !newsLoad && (
              <div style={{ padding:"20px 0", textAlign:"center" }}>
                <p style={{ fontSize:13, color:TEXT_LIGHT, margin:"0 0 12px" }}>{t("Could not load news.","تعذّر تحميل الأخبار.")}</p>
                <button onClick={() => { setNewsError(false); setNews([]); }} style={{ fontSize:12, fontWeight:700, color:MID_GREEN, background:"none", border:`1px solid ${BORDER}`, borderRadius:10, padding:"8px 18px", cursor:"pointer" }}>
                  {t("Try again","حاول مجدداً")}
                </button>
              </div>
            )}
            {!newsLoad && !newsError && news.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {news.map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                    <div style={{ display:"flex", gap:12, padding:"11px 12px", borderRadius:12, background:"#f8fafc", border:`1px solid ${BORDER}`, alignItems:"flex-start" }}>
                      {item.thumbnail
                        ? <img src={item.thumbnail} alt="" style={{ width:60, height:60, borderRadius:9, objectFit:"cover", flexShrink:0 }} onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
                        : <div style={{ width:60, height:60, borderRadius:9, background:`${DARK_GREEN}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Newspaper style={{ width:22, height:22, color:TEXT_LIGHT }} /></div>
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, margin:"0 0 4px", lineHeight:1.4, maxHeight:"calc(1.4em * 2)", overflow:"hidden" } as React.CSSProperties}>{item.title}</p>
                        <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"0 0 6px", lineHeight:1.5, maxHeight:"calc(1.5em * 2)", overflow:"hidden" } as React.CSSProperties}>{item.description}</p>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:10, color:TEXT_LIGHT }}>{relDate(item.pubDate)}</span>
                          <ExternalLink style={{ width:9, height:9, color:TEXT_LIGHT }} />
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
export default IslamicDailyFeed;
