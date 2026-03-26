export const SURAHS = [
  { id: 1, name: "Al-Fatihah", ayahs: 7 },
  { id: 2, name: "Al-Baqarah", ayahs: 286 },
  { id: 3, name: "Aal-Imran", ayahs: 200 },
  { id: 4, name: "An-Nisa", ayahs: 176 },
  { id: 5, name: "Al-Ma'idah", ayahs: 120 },
  { id: 6, name: "Al-An'am", ayahs: 165 },
  { id: 7, name: "Al-A'raf", ayahs: 206 },
  { id: 8, name: "Al-Anfal", ayahs: 75 },
  { id: 9, name: "At-Tawbah", ayahs: 129 },
  { id: 10, name: "Yunus", ayahs: 109 },
  { id: 11, name: "Hud", ayahs: 123 },
  { id: 12, name: "Yusuf", ayahs: 111 },
  { id: 13, name: "Ar-Ra'd", ayahs: 43 },
  { id: 14, name: "Ibrahim", ayahs: 52 },
  { id: 15, name: "Al-Hijr", ayahs: 99 },
  { id: 16, name: "An-Nahl", ayahs: 128 },
  { id: 17, name: "Al-Isra", ayahs: 111 },
  { id: 18, name: "Al-Kahf", ayahs: 110 },
  { id: 19, name: "Maryam", ayahs: 98 },
  { id: 20, name: "Ta-Ha", ayahs: 135 }
];

export const audioUrl = (surahNumber: number, ayahNumber: number) => {
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${surahNumber}${ayahNumber}.mp3`;
};

export default SURAHS;