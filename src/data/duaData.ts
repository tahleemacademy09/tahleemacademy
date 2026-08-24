/*
  src/data/duaData.ts — Tahleem Academy
  ──────────────────────────────────────────────────────────
  General du'a (supplications for daily life situations) — distinct
  from the fixed Morning/Evening Adhkaar cycle. Organised by category
  so students can jump straight to what they need (before eating,
  travel, distress, seeking knowledge, etc). Sourced from the Qur'an
  and authentic Sunnah (Hisn al-Muslim and standard hadith collections).
  Static data, no network required.
*/
import type { Dhikr } from "./adhkaarData";

export interface DuaCategory {
  id: string;
  label: string;
  labelAr: string;
}

export const DUA_CATEGORIES: DuaCategory[] = [
  { id: "daily", label: "Daily Life", labelAr: "الحياة اليومية" },
  { id: "worship", label: "Worship", labelAr: "العبادة" },
  { id: "travel", label: "Travel", labelAr: "السفر" },
  { id: "difficulty", label: "Difficulty & Distress", labelAr: "الكرب والهم" },
  { id: "knowledge", label: "Knowledge & Guidance", labelAr: "العلم والاستخارة" },
  { id: "protection", label: "Protection", labelAr: "الحماية" },
];

export const DUAS_BY_CATEGORY: Record<string, Dhikr[]> = {
  daily: [
    {
      id: "d-daily-1",
      arabic: "بِسْمِ اللَّهِ",
      transliteration: "Bismillah.",
      translation: "In the Name of Allah. (Said before eating; if you forget at the start, say: Bismillahi awwalahu wa akhirah — \"In the Name of Allah at its beginning and its end.\")",
      reference: "Abu Dawud · At-Tirmidhi (Sahih)",
      repeat: 1,
    },
    {
      id: "d-daily-2",
      arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ",
      transliteration: "Alhamdu lillahil-ladhi at'amani hadha wa razaqanihi min ghayri hawlim-minni wa la quwwah.",
      translation: "All praise is for Allah who fed me this and provided it for me without any power or might on my part.",
      reference: "Abu Dawud · At-Tirmidhi (Sahih)",
      repeat: 1,
    },
    {
      id: "d-daily-3",
      arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
      transliteration: "Alhamdu lillahil-ladhi ahyana ba'da ma amatana wa ilayhin-nushoor.",
      translation: "Praise is to Allah who gave us life after having taken it from us [in sleep], and unto Him is the resurrection.",
      virtue: "Said immediately upon waking, before the morning adhkaar.",
      reference: "Al-Bukhari",
      repeat: 1,
    },
    {
      id: "d-daily-4",
      arabic: "بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا، وَعَلَىٰ رَبِّنَا تَوَكَّلْنَا",
      transliteration: "Bismillahi walajna, wa bismillahi kharajna, wa 'ala Rabbina tawakkalna.",
      translation: "In the Name of Allah we enter, in the Name of Allah we leave, and upon our Lord we place our trust. (Said entering the home — then greet the household.)",
      reference: "Abu Dawud",
      repeat: 1,
    },
    {
      id: "d-daily-5",
      arabic: "بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
      transliteration: "Bismillah, tawakkaltu 'alallah, wa la hawla wa la quwwata illa billah.",
      translation: "In the Name of Allah, I place my trust in Allah, and there is no might nor power except with Allah. (Said leaving the home.)",
      virtue: "Whoever says this on leaving home is told: you are guided, sufficed, and protected, and the devils turn away from him.",
      reference: "Abu Dawud · At-Tirmidhi (Sahih)",
      repeat: 1,
    },
    {
      id: "d-daily-6",
      arabic: "اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ كَسَوْتَنِيهِ، أَسْأَلُكَ مِنْ خَيْرِهِ وَخَيْرِ مَا صُنِعَ لَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّهِ وَشَرِّ مَا صُنِعَ لَهُ",
      transliteration: "Allahumma lakal-hamd, anta kasawtaneeh, as'aluka min khayrihi wa khayri ma suni'a lah, wa a'oodhu bika min sharrihi wa sharri ma suni'a lah.",
      translation: "O Allah, to You is the praise. You have clothed me with it. I ask You for its good and the good of what it was made for, and I seek refuge in You from its evil and the evil of what it was made for.",
      virtue: "Said when wearing new clothing.",
      reference: "Abu Dawud · At-Tirmidhi (Sahih)",
      repeat: 1,
    },
  ],
  worship: [
    {
      id: "d-worship-1",
      arabic: "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
      transliteration: "Allahumma-ftah li abwaba rahmatik.",
      translation: "O Allah, open the doors of Your mercy for me. (Said entering the masjid, right foot first.)",
      reference: "Muslim",
      repeat: 1,
    },
    {
      id: "d-worship-2",
      arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
      transliteration: "Allahumma inni as'aluka min fadlik.",
      translation: "O Allah, I ask You from Your bounty. (Said leaving the masjid, left foot first.)",
      reference: "Muslim",
      repeat: 1,
    },
    {
      id: "d-worship-3",
      arabic: "أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ، اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ",
      transliteration: "Ash-hadu an la ilaha illallahu wahdahu la sharika lah, wa ash-hadu anna Muhammadan 'abduhu wa rasooluh. Allahumma-j'alni minat-tawwabeena waj'alni minal-mutatahhireen.",
      translation: "I bear witness that there is no god but Allah alone, without partner, and I bear witness that Muhammad is His servant and messenger. O Allah, make me among those who repent and make me among those who purify themselves.",
      virtue: "Whoever says this after completing wudu, the eight gates of Paradise are opened for him.",
      reference: "Muslim · At-Tirmidhi",
      repeat: 1,
    },
    {
      id: "d-worship-4",
      arabic: "اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ",
      transliteration: "Allahumma Rabba hadhihid-da'watit-tammah, was-salatil-qa'imah, ati Muhammadanil-waseelata wal-fadeelah, wab'athhu maqaman mahmoodanil-ladhi wa'adtah.",
      translation: "O Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and favor, and raise him to the praiseworthy station You have promised him.",
      virtue: "Said after hearing the adhan (following the response to each phrase).",
      reference: "Al-Bukhari",
      repeat: 1,
    },
  ],
  travel: [
    {
      id: "d-travel-1",
      arabic: "اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَىٰ رَبِّنَا لَمُنْقَلِبُونَ، اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَىٰ، وَمِنَ الْعَمَلِ مَا تَرْضَىٰ، اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ",
      transliteration: "Allahu akbar, Allahu akbar, Allahu akbar. Subhanal-ladhi sakhkhara lana hadha wa ma kunna lahu muqrineen, wa inna ila Rabbina lamunqaliboon. Allahumma inna nas'aluka fi safarina hadhal-birra wat-taqwa, wa minal-'amali ma tarda. Allahumma hawwin 'alayna safarana hadha watwi 'anna bu'dah. Allahumma antas-sahibu fis-safar, wal-khalifatu fil-ahl.",
      translation: "Allah is the Greatest, Allah is the Greatest, Allah is the Greatest. Glory to Him who has subjected this to us, for we could never have accomplished it by ourselves, and to our Lord we are returning. O Allah, we ask You for righteousness and piety in this journey, and for deeds that please You. O Allah, make this journey easy for us and shorten its distance. O Allah, You are the Companion on the journey and the Guardian of the family left behind.",
      virtue: "Said upon mounting/boarding to begin a journey.",
      reference: "Muslim",
      repeat: 1,
    },
    {
      id: "d-travel-2",
      arabic: "اللَّهُمَّ رَبَّ السَّمَاوَاتِ السَّبْعِ وَمَا أَظْلَلْنَ، وَرَبَّ الْأَرَضِينَ السَّبْعِ وَمَا أَقْلَلْنَ، وَرَبَّ الشَّيَاطِينِ وَمَا أَضْلَلْنَ، أَسْأَلُكَ خَيْرَ هَذِهِ الْقَرْيَةِ وَخَيْرَ أَهْلِهَا، وَأَعُوذُ بِكَ مِنْ شَرِّهَا وَشَرِّ أَهْلِهَا وَشَرِّ مَا فِيهَا",
      transliteration: "Allahumma Rabbas-samawatis-sab'i wa ma adhlalna, wa Rabbal-aradeenas-sab'i wa ma aqlalna, wa Rabbash-shayateeni wa ma adlalna, as'aluka khayra hadhihil-qaryati wa khayra ahliha, wa a'oodhu bika min sharriha wa sharri ahliha wa sharri ma feeha.",
      translation: "O Allah, Lord of the seven heavens and what they shade, Lord of the seven earths and what they carry, Lord of the devils and what they lead astray, I ask You for the good of this town and the good of its people, and I seek refuge in You from its evil, the evil of its people, and the evil within it.",
      virtue: "Said upon entering a town or city.",
      reference: "Ibn as-Sunni (Sahih)",
      repeat: 1,
    },
  ],
  difficulty: [
    {
      id: "d-diff-1",
      arabic: "اللَّهُمَّ إِنِّي عَبْدُكَ، ابْنُ عَبْدِكَ، ابْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ، مَاضٍ فِيَّ حُكْمُكَ، عَدْلٌ فِيَّ قَضَاؤُكَ، أَسْأَلُكَ بِكُلِّ اسْمٍ هُوَ لَكَ سَمَّيْتَ بِهِ نَفْسَكَ، أَوْ أَنْزَلْتَهُ فِي كِتَابِكَ، أَوْ عَلَّمْتَهُ أَحَدًا مِنْ خَلْقِكَ، أَوِ اسْتَأْثَرْتَ بِهِ فِي عِلْمِ الْغَيْبِ عِنْدَكَ، أَنْ تَجْعَلَ الْقُرْآنَ رَبِيعَ قَلْبِي، وَنُورَ صَدْرِي، وَجَلَاءَ حُزْنِي، وَذَهَابَ هَمِّي",
      transliteration: "Allahumma inni 'abduka, ibnu 'abdika, ibnu amatika, nasiyati biyadika, madin fiyya hukmuka, 'adlun fiyya qada'uka, as'aluka bikulli-smin huwa lak, sammayta bihi nafsak, aw anzaltahu fi kitabik, aw 'allamtahu ahadam-min khalqik, awista'tharta bihi fi 'ilmil-ghaybi 'indak, an taj'alal-Qur'ana rabee'a qalbi, wa noora sadri, wa jala'a huzni, wa dhahaba hammi.",
      translation: "O Allah, I am Your servant, son of Your servant, son of Your maidservant. My forelock is in Your hand, Your judgment upon me is forever executed, and Your decree over me is just. I ask You by every name belonging to You which You have named Yourself with, or revealed in Your Book, or taught to any of Your creation, or kept hidden in the knowledge of the unseen with You, that You make the Qur'an the spring of my heart, the light of my chest, the removal of my sadness, and the departure of my anxiety.",
      virtue: "Whoever says this when anxious or grieving, Allah removes his distress and grief and replaces it with joy.",
      reference: "Ahmad (Sahih)",
      repeat: 1,
    },
    {
      id: "d-diff-2",
      arabic: "اللَّهُمَّ رَحْمَتَكَ أَرْجُو، فَلَا تَكِلْنِي إِلَىٰ نَفْسِي طَرْفَةَ عَيْنٍ، وَأَصْلِحْ لِي شَأْنِي كُلَّهُ، لَا إِلَٰهَ إِلَّا أَنْتَ",
      transliteration: "Allahumma rahmataka arjoo, fala takilni ila nafsi tarfata 'ayn, wa aslih li sha'ni kullah, la ilaha illa ant.",
      translation: "O Allah, it is Your mercy I hope for, so do not leave me to myself even for the blink of an eye. Set right all my affairs. There is no god but You.",
      reference: "Abu Dawud (Sahih)",
      repeat: 1,
    },
    {
      id: "d-diff-3",
      arabic: "إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ، اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي وَأَخْلِفْ لِي خَيْرًا مِنْهَا",
      transliteration: "Inna lillahi wa inna ilayhi raji'oon. Allahumma-jurni fi museebati wa akhlif li khayram-minha.",
      translation: "Indeed we belong to Allah, and indeed to Him we will return. O Allah, reward me in my affliction and replace it for me with something better.",
      virtue: "Said upon hearing of or experiencing a calamity or loss.",
      reference: "Muslim",
      repeat: 1,
    },
    {
      id: "d-diff-4",
      arabic: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ",
      transliteration: "Allahumma-kfini bihalalika 'an haramik, wa aghnini bifadlika 'amman siwak.",
      translation: "O Allah, suffice me with what You have made lawful instead of what You have made unlawful, and make me independent of all others besides You by Your favor.",
      virtue: "Said when burdened by debt or hardship.",
      reference: "At-Tirmidhi (Hasan)",
      repeat: 1,
    },
  ],
  knowledge: [
    {
      id: "d-know-1",
      arabic: "رَبِّ زِدْنِي عِلْمًا",
      transliteration: "Rabbi zidni 'ilma.",
      translation: "My Lord, increase me in knowledge. (Good to say before study or a lesson.)",
      reference: "Al-Qur'an, Ta-Ha 20:114",
      repeat: 1,
    },
    {
      id: "d-know-2",
      arabic: "اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا",
      transliteration: "Allahumma la sahla illa ma ja'altahu sahla, wa anta taj'alul-hazna idha shi'ta sahla.",
      translation: "O Allah, nothing is easy except what You make easy, and You make the difficult easy if You will. (Said before a hard task, an exam, or memorising something new.)",
      reference: "Ibn Hibban · Ibn as-Sunni (Sahih)",
      repeat: 1,
    },
    {
      id: "d-know-3",
      arabic: "اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ، اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ، وَاقْدُرْ لِيَ الْخَيْرَ حَيْثُ كَانَ ثُمَّ أَرْضِنِي بِهِ",
      transliteration: "Allahumma inni astakheeruka bi'ilmik, wa astaqdiruka biqudratik, wa as'aluka min fadlikal-'adheem, fa'innaka taqdiru wa la aqdir, wa ta'lamu wa la a'lam, wa anta 'allamul-ghuyoob. Allahumma in kunta ta'lamu anna hadhal-amra khayrul-li fi deeni wa ma'ashi wa 'aqibati amri, faqdurhu li wa yassirhu li thumma barik li feeh, wa in kunta ta'lamu anna hadhal-amra sharrul-li fi deeni wa ma'ashi wa 'aqibati amri, fasrifhu 'anni wasrifni 'anhu, waqdur liyal-khayra haythu kana thumma ardini bih.",
      translation: "O Allah, I seek Your guidance by Your knowledge, and I seek ability by Your power, and I ask You from Your immense bounty. You are able and I am not, You know and I do not, and You are the Knower of the unseen. O Allah, if You know that this matter is good for me in my religion, my livelihood and the outcome of my affairs, then decree it for me, make it easy for me, and bless it for me. And if You know that this matter is bad for me in my religion, my livelihood and the outcome of my affairs, then turn it away from me and turn me away from it, and decree for me what is good wherever it may be, and make me content with it.",
      virtue: "Du'a al-Istikharah — recited after praying two voluntary rak'ahs when seeking guidance on a decision (state the matter in place of 'this matter').",
      reference: "Al-Bukhari",
      repeat: 1,
    },
  ],
  protection: [
    {
      id: "d-prot-1",
      arabic: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ",
      transliteration: "A'oodhu bikalimatil-lahit-tammati min sharri ma khalaq.",
      translation: "I seek refuge in the perfect words of Allah from the evil of what He has created.",
      virtue: "Whoever says this three times each evening will not be harmed by a scorpion's sting that night.",
      reference: "Muslim",
      repeat: 3,
    },
    {
      id: "d-prot-2",
      arabic: "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
      transliteration: "A'oodhu billahi minash-shaytanir-rajeem.",
      translation: "I seek refuge in Allah from Satan, the accursed. (Said when angry, to repel a whisper, or before reciting Qur'an.)",
      reference: "Al-Bukhari · Muslim",
      repeat: 1,
    },
    {
      id: "d-prot-3",
      arabic: "الْحَمْدُ لِلَّهِ ← يَرْحَمُكَ اللَّهُ ← يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ",
      transliteration: "Sneezer: Alhamdulillah. Listener: Yarhamukallah. Sneezer replies: Yahdeekumullahu wa yuslihu balakum.",
      translation: "The sneezer says: \"Praise be to Allah.\" Whoever hears it replies: \"May Allah have mercy on you.\" The sneezer then replies: \"May Allah guide you and rectify your condition.\"",
      virtue: "The etiquette of sneezing, taught directly by the Prophet ﷺ.",
      reference: "Al-Bukhari",
      repeat: 1,
    },
    {
      id: "d-prot-4",
      arabic: "اللَّهُمَّ صَيِّبًا نَافِعًا",
      transliteration: "Allahumma sayyiban nafi'a.",
      translation: "O Allah, [make it] a beneficial rain cloud. (Said when it rains.)",
      reference: "Al-Bukhari",
      repeat: 1,
    },
  ],
};
