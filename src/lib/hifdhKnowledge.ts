/*
  hifdhKnowledge.ts — curated tafseer / revelation / event questions for the daily revision test.

  Each entry applies to a verse range of one surah. When today's pages (or an earlier revised page) include any verse in
  the range, the entry can become a multiple-choice question. Every entry carries its OWN wrong options so no question
  depends on guessing distractors.

  ► Please have a teacher review this list before relying on it, and extend it: add entries in the same shape.
    Keep every statement to what is firmly established (authentic report or the plain meaning of the verses).
*/
export type KnowledgeKind = "reason" | "event" | "tafseer";
export interface KnowledgeItem {
  s: number; from: number; to: number;        // surah number, first and last verse the question is about
  kind: KnowledgeKind;
  q: string;                                   // English question
  qAr?: string;                                // optional Arabic wording
  correct: string; wrong: [string, string, string];
}

export const KNOWLEDGE: KnowledgeItem[] = [
  { s: 96, from: 1, to: 5, kind: "event", q: "Where was the Prophet ﷺ when the first verses of the Qur'an (Al-'Alaq) were revealed?", qAr: "أين كان النبي ﷺ حين نزلت أولى آيات القرآن؟",
    correct: "In the cave of Hira, where Jibreel (AS) came to him", wrong: ["In the Ka'bah during tawaf", "In Madinah, at the mosque", "On the way to Ta'if"] },
  { s: 108, from: 1, to: 3, kind: "reason", q: "Why was Surah Al-Kawthar revealed?", qAr: "ما سبب نزول سورة الكوثر؟",
    correct: "To console the Prophet ﷺ against those who mocked him as 'cut off' (abtar)", wrong: ["To announce the conquest of Makkah", "To command the Hajj", "To describe the Day of Judgement"] },
  { s: 111, from: 1, to: 5, kind: "reason", q: "What led to the revelation of Surah Al-Masad?", qAr: "ما سبب نزول سورة المسد؟",
    correct: "Abu Lahab's harsh reply when the Prophet ﷺ called Quraysh together on Mount Safa", wrong: ["The Battle of Badr", "The migration to Abyssinia", "The treaty of Hudaybiyyah"] },
  { s: 105, from: 1, to: 5, kind: "event", q: "Which event does Surah Al-Fil describe?", qAr: "أي حادثة تذكرها سورة الفيل؟",
    correct: "Abraha's army, with elephants, coming to destroy the Ka'bah and being destroyed by Allah", wrong: ["The flood in the time of Nuh (AS)", "The destruction of the people of 'Ad", "The Muslims' victory at Badr"] },
  { s: 112, from: 1, to: 4, kind: "reason", q: "What did the disbelievers ask the Prophet ﷺ that led to Surah Al-Ikhlas?", qAr: "عمّ سأل المشركون النبي ﷺ فنزلت سورة الإخلاص؟",
    correct: "They asked him to describe his Lord", wrong: ["They asked him to move the mountains of Makkah", "They asked him for a miracle from the sky", "They asked him about the Day of Judgement's date"] },
  { s: 80, from: 1, to: 10, kind: "reason", q: "Who came to the Prophet ﷺ while he was speaking to the Quraysh leaders, leading to Surah 'Abasa?", qAr: "من الذي جاء النبي ﷺ وهو يخاطب كبار قريش فنزلت سورة عبس؟",
    correct: "The blind man 'Abdullah ibn Umm Maktum", wrong: ["Bilal ibn Rabah", "Abu Bakr as-Siddiq", "Zayd ibn Harithah"] },
  { s: 93, from: 1, to: 11, kind: "reason", q: "What was said by the disbelievers that Surah Ad-Duha answers?", qAr: "ماذا قال المشركون فنزلت سورة الضحى ردًّا عليه؟",
    correct: "That his Lord had abandoned him, after revelation paused for a time", wrong: ["That he was a poet", "That he had invented the Qur'an in Madinah", "That he should be made a king"] },
  { s: 30, from: 1, to: 5, kind: "event", q: "What event do the opening verses of Surah Ar-Rum speak about?", qAr: "عن أي حدث تتحدث الآيات الأولى من سورة الروم؟",
    correct: "The Romans' defeat by the Persians, and the promise of their victory within a few years", wrong: ["The Muslims' defeat at Uhud", "The sinking of Pharaoh", "The building of the Ka'bah"] },
  { s: 53, from: 13, to: 18, kind: "event", q: "What did the Prophet ﷺ see by the Lote-Tree of the Utmost Boundary (Sidrat al-Muntaha)?", qAr: "ماذا رأى النبي ﷺ عند سدرة المنتهى؟",
    correct: "Some of the greatest signs of his Lord (he saw Jibreel in his true form)", wrong: ["The army of Abraha", "The Sleepers of the Cave", "The Day of Judgement being established"] },
  { s: 110, from: 1, to: 3, kind: "tafseer", q: "What does Surah An-Nasr tell the Prophet ﷺ to do when Allah's victory comes?", qAr: "بماذا أُمر النبي ﷺ إذا جاء نصر الله والفتح؟",
    correct: "Glorify his Lord with praise and seek His forgiveness", wrong: ["Fight the remaining tribes at once", "Leave Makkah immediately", "Stop calling people to Islam"] },
  { s: 97, from: 1, to: 5, kind: "tafseer", q: "According to Surah Al-Qadr, the Night of Decree is better than…", qAr: "ليلة القدر خير من…",
    correct: "A thousand months", wrong: ["A thousand years of fasting", "A hundred Hajj journeys", "Ten thousand nights"] },
  { s: 18, from: 9, to: 26, kind: "event", q: "Whose story is told in Surah Al-Kahf, verses 9–26?", qAr: "قصة من تُروى في سورة الكهف من الآية 9 إلى 26؟",
    correct: "The youths who took refuge in the cave (Ashab al-Kahf)", wrong: ["The people of the Elephant", "The companions of the Garden", "The people of Saba"] },
  { s: 18, from: 83, to: 98, kind: "event", q: "Who is Dhul-Qarnayn's story about in Surah Al-Kahf?", qAr: "من هو ذو القرنين الذي تحكي عنه سورة الكهف؟",
    correct: "A righteous ruler whom Allah gave power; he travelled east and west and built a barrier against Ya'juj and Ma'juj", wrong: ["A prophet sent to the people of Madyan", "A king who claimed to be a lord", "A companion of Musa (AS) on his journey"] },
];
