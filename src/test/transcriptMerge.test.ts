import { describe, it, expect } from "vitest";
import { mergeHeard } from "@/lib/transcriptMerge";
import { analyzeRecitation } from "@/lib/recitationCompare";

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const bare = (s: string) => s.replace(/[\u064B-\u065F\u0670]/g, "");

describe("mergeHeard — overlapping chunks", () => {
  const verse = words("هُوَ الَّذِي أَرْسَلَ رَسُولَهُ بِالْهُدَى وَدِينِ الْحَقِّ لِيُظْهِرَهُ عَلَى الدِّينِ كُلِّهِ وَلَوْ كَرِهَ الْمُشْرِكُونَ يَا أَيُّهَا الَّذِينَ آمَنُوا هَلْ أَدُلُّكُمْ عَلَى تِجَارَةٍ تُنْجِيكُمْ مِنْ عَذَابٍ أَلِيمٍ");
  const join = (cut: number, overlap: number, mutate: (b: string[]) => string[] = (b) => b) =>
    words(mergeHeard(verse.slice(0, cut + overlap).join(" "), mutate(verse.slice(cut)).join(" ")));

  it("identical overlap is merged once", () => {
    for (const ov of [3, 6, 10, 12]) expect(join(14, ov)).toHaveLength(verse.length);
  });
  it("a replaced / skipped / differently heard word in the overlap no longer duplicates the whole overlap", () => {
    expect(join(14, 8, (b) => { const c = [...b]; c[3] = "الذين"; return c; })).toHaveLength(verse.length);
    expect(join(14, 8, (b) => { const c = [...b]; c.splice(4, 1); return c; })).toHaveLength(verse.length);
    expect(join(14, 12, (b) => { const c = [...b]; c[2] = "الذين"; c[9] = "وهو"; return c; })).toHaveLength(verse.length);
  });
  it("seams from a real recording: a sliced word at the cut", () => {
    const cases: [string, string, string][] = [
      ["وَمَنْ أَظْلَمُ مِمَّنِ افْتَرَى عَلَى اللَّهِ الْكَذِبَ وَهُوَ يُدْعَى", "كَذِبًا وَهُوَ يُدْعَى إِلَى الْإِسْلَامِ وَاللَّهُ لَا يَهْدِي", "وَمَنْ أَظْلَمُ مِمَّنِ افْتَرَى عَلَى اللَّهِ الْكَذِبَ وَهُوَ يُدْعَى إِلَى الْإِسْلَامِ وَاللَّهُ لَا يَهْدِي"],
      ["هُوَ الَّذِي أَرْسَلَ رَسُولَهُ بِالْهُدَى وَدِينِ الْحَقِّ لِيُظْهِرَهُ عَلَى الدِّينِ", "ظَهْرَهُ عَلَى الدِّينِ كُلِّهِ وَلَوْ كَرِهَ الْمُشْرِكُونَ", "هُوَ الَّذِي أَرْسَلَ رَسُولَهُ بِالْهُدَى وَدِينِ الْحَقِّ لِيُظْهِرَهُ عَلَى الدِّينِ كُلِّهِ وَلَوْ كَرِهَ الْمُشْرِكُونَ"],
      ["وَمُبَشِّرًا بِرَسُولٍ يَأْتِي مِنْ بَعْدِي اسْمُهُ أَحْمَدُ فَلَمَّا جَاءَهُمْ بَيِّنَاتٍ قَالُوا", "بِالْبَيِّنَاتِ قَالُوا هَذَا سِحْرٌ مُبِينٌ وَمَنْ أَظْلَمُ", "وَمُبَشِّرًا بِرَسُولٍ يَأْتِي مِنْ بَعْدِي اسْمُهُ أَحْمَدُ فَلَمَّا جَاءَهُمْ بَيِّنَاتٍ قَالُوا هَذَا سِحْرٌ مُبِينٌ وَمَنْ أَظْلَمُ"],
      ["وَلَوْ كَرِهَ الْمُشْرِكُونَ يَا أَيُّهَا الَّذِينَ آمَنُوا هَلْ أَدُلُّكُمْ عَلَى تِجَارَةٍ", "لَوْ كُنْ عَلَى تِجَارَةٍ تُنْجِيكُمْ مِنْ عَذَابٍ أَلِيمٍ", "وَلَوْ كَرِهَ الْمُشْرِكُونَ يَا أَيُّهَا الَّذِينَ آمَنُوا هَلْ أَدُلُّكُمْ عَلَى تِجَارَةٍ تُنْجِيكُمْ مِنْ عَذَابٍ أَلِيمٍ"],
    ];
    for (const [a, b, want] of cases) expect(bare(mergeHeard(a, b))).toBe(bare(want));
  });
  it("chunks cut inside a pause never lose or merge words", () => {
    expect(words(mergeHeard("قل هو الله", "الله أحد", false))).toHaveLength(5);
  });
  it("no shared audio → plain concatenation", () => {
    expect(words(mergeHeard(verse.slice(0, 10).join(" "), verse.slice(10).join(" ")))).toHaveLength(verse.length);
  });
});

describe("analyzeRecitation — echoes", () => {
  it("a phrase repeated straight away that the text never repeats is not shown as extra words", () => {
    const ref = "فَبِأَيِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ";
    expect(analyzeRecitation(ref, "فبأي آلاء ربكما تكذبان فبأي آلاء ربكما تكذبان").extras).toEqual([]);
  });
  it("a refrain the text really repeats is kept", () => {
    const ref = "فَبِأَيِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ فَبِأَيِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ";
    expect(analyzeRecitation(ref, "فبأي آلاء ربكما تكذبان فبأي آلاء ربكما تكذبان").words.every((w) => w.grade === "ok")).toBe(true);
  });
});
