/*  SeerahData.tsx — The Sealed Nectar (Ar-Raheeq Al-Makhtum)
    Safiur Rahman Al-Mubarakpuri
    57 sequential daily episodes — complete Seerah from pre-Islamic Arabia
    to the eternal legacy of the Prophet ﷺ
    Place at: src/components/dashboard/SeerahData.tsx
    Add to IslamicDailyFeed.tsx imports:
    import { SEERAH_EPISODES, SeerahEpisode } from './SeerahData';
    Usage: const dailySeerah = SEERAH_EPISODES[doy % SEERAH_EPISODES.length];
*/

export interface SeerahEpisode {
  episode: number;
  title: string;
  titleAr: string;
  year: string;
  content: string;
}

export const SEERAH_EPISODES: SeerahEpisode[] = [
  {
    episode: 1,
    title: `Arabia Before Islam — The Land and Its People`,
    titleAr: `الجزيرة العربية قبل الإسلام`,
    year: `Pre-Revelation`,
    content: `The Arabian Peninsula — a vast expanse of desert, mountains, and coastline — was the cradle from which the final message of Allah would emerge. To understand the Prophet ﷺ, one must first understand the land he was born into.

Arabia is bordered by the Red Sea to the west, the Arabian Sea to the south, the Persian Gulf to the east, and the fertile crescent to the north. It is predominantly desert — the Rub' al-Khali (Empty Quarter) in the south is one of the largest sand deserts on earth. Yet between these extremes lay cities of trade, valleys of agriculture, and mountain settlements of remarkable culture.

The Arabs were divided into two great branches: the "perished Arabs" (Al-Arab al-Ba'idah) — ancient tribes like 'Ad and Thamud whose stories are preserved in the Quran as warnings — and the surviving Arabs (Al-Arab al-Baqiyah), themselves divided into the pure Arabs descended from Ya'rub ibn Qahtan, and the Arabicised Arabs (al-Musta'ribah) descended from Prophet Isma'il ibn Ibrahim (AS).

The Prophet ﷺ descended from the Arabicised Arabs — from Isma'il (AS) — through the noble lineage of Adnan. The Quraysh were his tribe, custodians of the Ka'bah in Makkah, the most honoured city in all of Arabia.

Arabia had no unified state, no king, no permanent army. Tribes were the political units. A tribe's honour was everything — to avenge a tribesman's blood, to protect a guest, to be generous to the traveller. These were the cardinal virtues. Everything else — truth, justice, mercy to the weak — was secondary to tribal loyalty.

It is into this world — noble in some ways, savage in others — that Allah chose to send His final Prophet ﷺ.`,
  },
  {
    episode: 2,
    title: `The Religious State of Arabia — Idolatry, Christianity, and Judaism`,
    titleAr: `الحالة الدينية في الجزيرة العربية`,
    year: `Pre-Revelation`,
    content: `The spiritual condition of Arabia before Islam was profound darkness — what the Quran calls al-Jahiliyyah (the Age of Ignorance). Yet this darkness was not uniform. It had layers, histories, and pockets of light.

The original religion of the Arabs was the pure monotheism of Ibrahim (AS). When he and Isma'il (AS) built the Ka'bah, they established it as the house of Allah alone. The corruption began through 'Amr ibn Luhayy al-Khuza'i, who brought the idol Hubal from Syria to Makkah and invited the Arabs to worship it. The Prophet ﷺ said: "I saw 'Amr ibn Luhayy dragging his intestines in Hellfire" — the man who first corrupted the pure religion of Ibrahim.

By the time of the Prophet ﷺ, there were 360 idols around and inside the Ka'bah. Every tribe had its own idol. The most famous were: Hubal (inside the Ka'bah), Al-Lat (in Ta'if), Al-Uzza (in Nakhlah), and Manat (between Makkah and Madinah). The Quran specifically mentions these three in Surah An-Najm.

Judaism had significant communities in Madinah — the Banu Qaynuqa', Banu al-Nadir, and Banu Qurayza. They possessed the Torah and knowledge of a coming prophet, and had actually settled near Yathrib in anticipation of following him.

Christianity was present in Yemen, in Najran, and among some Arab tribes near Byzantine territory. Both Christianity and Judaism had become heavily corrupted by this time.

A fourth group — the Hunafa': individuals like Zayd ibn 'Amr ibn Nufayl who rejected idolatry and preserved elements of the monotheism of Ibrahim (AS). These men sensed that a prophet was coming.

It is into this religious chaos — 360 idols, corrupted scriptures, fragments of pure monotheism — that the Quran would descend as a clarifying light.`,
  },
  {
    episode: 3,
    title: `The Social Condition of Pre-Islamic Arabia`,
    titleAr: `الحالة الاجتماعية في الجاهلية`,
    year: `Pre-Revelation`,
    content: `To appreciate the magnitude of what the Prophet ﷺ achieved, one must understand the social fabric of pre-Islamic Arabia — its beauty, its savagery, and the specific evils that Islam came to eradicate.

The Arabs of Jahiliyyah were not without virtue. Their poetry was extraordinary — the seven Mu'allaqat (Golden Odes) hung on the Ka'bah were literary masterpieces. Their generosity was legendary — a man would slaughter his last camel for a guest. Their sense of honour, their word once given, their courage in battle — these were real qualities that Islam would channel and refine, not destroy.

But the social evils were severe. The most prominent was the treatment of women. A man could have unlimited wives with no obligation. A woman had no right of inheritance, no legal personhood. Most grotesque of all was wa'd — the practice of burying infant daughters alive. The Quran describes the horror: "And when the girl buried alive is asked: for what sin was she killed?" (81:8-9).

The class structure was brutal. Slaves had no rights whatsoever — they could be beaten, killed, or sold. Bilal (RA), who would become one of the greatest companions, was tortured on the hot sand of Makkah with a rock on his chest simply for saying "Ahad, Ahad."

Tribal vengeance was institutionalised. The Battle of Basus — a war between Bakr and Taghlib — lasted forty years over the killing of a camel. Alcohol was not merely permitted but celebrated. Gambling was a social institution — men would gamble away their wives, their children, their own freedom.

Yet even in this darkness, Allah's wisdom was evident in the timing. The Arabs' mastery of language, their vast oral memory, their trade networks connecting three continents — all of these would become instruments for the spread of Islam once the light came.`,
  },
  {
    episode: 4,
    title: `The Lineage of the Prophet ﷺ — From Adam to Abdullah`,
    titleAr: `نسب النبي ﷺ من آدم إلى عبد الله`,
    year: `Pre-Birth`,
    content: `The Prophet Muhammad ﷺ has the most noble lineage in all of human history. Allah chose him not only as the final messenger but placed him in the most honoured bloodline — a lineage that scholars describe as a chain of light from prophet to prophet.

His genealogy runs: Muhammad ibn Abdullah ibn Abd al-Muttalib ibn Hashim ibn Abd Manaf ibn Qusayy ibn Kilab... ibn Adnan. From Adnan to Isma'il (AS), the exact number of generations is not definitively established — the Prophet ﷺ himself forbade speculative extension of the lineage beyond Adnan, saying: "The genealogists lie."

QUSAYY IBN KILAB reunified the Quraysh in Makkah, took control of the Ka'bah's custodianship, and built Dar al-Nadwah — the first house near the Ka'bah serving as Makkah's parliament.

HASHIM IBN ABD MANAF — great-grandfather of the Prophet ﷺ — was famous for his extraordinary generosity and for establishing the two great trade caravans of Quraysh: the winter journey to Yemen and the summer journey to Syria, mentioned in Surah Quraysh: "For the accustomed security of the Quraysh..." He died in Gaza on a trade journey.

ABD AL-MUTTALIB — the grandfather — was one of the most remarkable figures of his generation. He rediscovered the Zamzam well and was the man who nearly sacrificed his son Abdullah.

ABDULLAH — the father — a young man of exceptional beauty and virtue who died before his son was born. The Prophet ﷺ said: "Allah chose Kinanah from the sons of Isma'il, He chose Quraysh from Kinanah, He chose Banu Hashim from Quraysh, and He chose me from Banu Hashim." Every generation was a selection by Allah — purifying, elevating, preparing — until the final jewel of creation emerged.`,
  },
  {
    episode: 5,
    title: `Abd al-Muttalib — The Grandfather Who Rediscovered Zamzam`,
    titleAr: `عبد المطلب وإعادة اكتشاف زمزم`,
    year: `Pre-Birth`,
    content: `Abd al-Muttalib ibn Hashim was the grandfather of the Prophet ﷺ and one of the most remarkable men of pre-Islamic Arabia. His original name was Shaybah. When his father Hashim died in Gaza, his uncle Muttalib brought him to Makkah on his camel — people assumed he was Muttalib's slave and called him Abd al-Muttalib (slave of Muttalib). The name stuck even after the truth was known.

THE REDISCOVERY OF ZAMZAM: The Zamzam well had been buried for centuries, its location forgotten. Abd al-Muttalib was commanded in a dream to dig in a specific location. He went with his only son Al-Harith and began digging. The Quraysh mocked him — what was this man digging for? When Zamzam appeared, gushing with water after centuries of absence, the mockery stopped.

THE VOW OF A HUNDRED CAMELS: During the excavation, Abd al-Muttalib faced hostility from Quraysh claiming joint rights. Alone with only one son, he made a vow to Allah: "If I am given ten sons who reach manhood, I will sacrifice one of them for You at the Ka'bah."

Allah gave him ten sons. When all ten reached manhood, he cast lots — and the lot fell on Abdullah, his youngest and most beloved, whom the Quraysh described as having light on his face.

Abd al-Muttalib prepared to sacrifice Abdullah. The women of Quraysh wept. His other sons protested. A wise woman advised: cast lots between Abdullah and camels, adding ten more each time the lot falls on Abdullah, until the camels win. The lot kept falling on Abdullah until they reached one hundred camels — then the lot finally fell on the camels. Abd al-Muttalib slaughtered one hundred camels in thanksgiving. From this incident, the blood money for a man was established at one hundred camels — confirmed later by the Prophet ﷺ in Islam.

Abdullah — saved by this divine intervention — was married to Aminah bint Wahb. Their marriage would produce the final Prophet of Allah ﷺ.`,
  },
  {
    episode: 6,
    title: `The Year of the Elephant — Abraha's Army`,
    titleAr: `عام الفيل وجيش أبرهة`,
    year: `570 CE`,
    content: `The Year of the Elephant is one of the most dramatic events in Arabian history — so significant that Allah revealed an entire Surah about it (Al-Fil). It occurred the same year the Prophet ﷺ was born.

Abraha al-Ashram was the Abyssinian governor of Yemen. He built a magnificent cathedral in Sana'a called Al-Qullays, intending to divert the Arabs' pilgrimage from Makkah to Yemen. When a man from Kinanah defiled the cathedral in protest, Abraha swore to demolish the Ka'bah stone by stone. He assembled a massive army with war elephants — the most terrifying weapon of ancient warfare. The lead elephant was named Mahmud.

The army swept through Arabia, defeating every tribe in its path. When they reached near Makkah, Abd al-Muttalib went to negotiate the return of his 200 camels that had been seized. Abraha was astonished — the chief of Quraysh, custodian of the most sacred house in Arabia, and all he wanted was his camels? Abraha said: "I was impressed by you — but now I've lost respect for you. You speak of your camels but say nothing about the House I've come to destroy." Abd al-Muttalib replied with the most dignified response in Seerah: "I am the owner of the camels. The House has its Owner who will protect it."

When Abraha's army advanced with Mahmud leading the charge, the elephant refused to move toward the Ka'bah. They beat it, prodded it — it would kneel and refuse when turned toward Makkah, but ran when turned toward Yemen.

Then Allah sent flocks of birds (Ababil) from the direction of the sea — each carrying three stones of hard clay. They rained down on the army. Every man struck was killed. Abraha himself was struck — his fingers fell off one by one, his flesh rotted as he retreated. He died before reaching Yemen. The army was annihilated.

"Have you not seen what your Lord did with the Companions of the Elephant? Did He not make their plot go astray? And He sent against them birds in flocks..." (105:1-3)

This was the year the Prophet ﷺ was born — the year Allah demonstrated that He protects His house, and was about to place the greatest of His servants into that protected land.`,
  },
  {
    episode: 7,
    title: `The Birth of the Prophet ﷺ`,
    titleAr: `مولد النبي ﷺ`,
    year: `570 CE / 53 BH`,
    content: `Muhammad ﷺ was born in Makkah, in the neighbourhood of Banu Hashim, in the house of his grandfather Abd al-Muttalib. The most accepted date among scholars is the 12th of Rabi' al-Awwal, approximately 570 CE — the Year of the Elephant.

His father Abdullah had died while on a trade journey to Madinah, several months before the birth — leaving his mother Aminah a widow. Aminah bint Wahb — the most honoured woman of Quraysh in nobility — reported experiencing an extraordinary pregnancy: no heaviness, no illness, none of the usual burdens. When she was in labour, she saw a light emerge from her that illuminated the castles of Syria. This corresponds to what the Prophet ﷺ himself said: "I am the du'a of my father Ibrahim (AS) and the glad tidings of my brother 'Isa (AS), and my mother saw that a light came out with her when she delivered me, illuminating the palaces of Syria."

When Aminah sent news to Abd al-Muttalib, he rushed to her. He held the newborn, carried him to the Ka'bah, stood before it and thanked Allah, and gave the boy an unusual name: Muhammad — meaning "the one who is repeatedly praised." When asked why he chose a name not from the family's tradition, he said: "I want him to be praised in the heavens and the earth."

The Prophet ﷺ was first nursed by his mother Aminah, then briefly by Thuwaybah — the freed slave of his uncle Abu Lahab. Abu Lahab was so pleased at news of the birth that he freed Thuwaybah on that day. The Prophet ﷺ later said: "The freeing of Thuwaybah reduced Abu Lahab's punishment every Monday." Even a fleeting act of joy at his birth earned mitigation for a man condemned in the Quran.

Various narrations describe signs accompanying the birth: the fire of the Persians that had burned for a thousand years was extinguished; the palace of Khosrow shook and fourteen of its battlements fell. These are understood as signs heralding the end of two great empires — Byzantine and Persian — that would be transformed by this child.

He was born an orphan. He would die the most beloved man in history.`,
  },
  {
    episode: 8,
    title: `With Halimah al-Sa'diyyah — Years in the Desert`,
    titleAr: `في بني سعد — حليمة السعدية`,
    year: `570–576 CE`,
    content: `The custom of Makkah's nobles was to send newborns to desert tribes to be nursed for the first several years — the desert air was cleaner, the life more vigorous, and children would learn the purest Arabic. The Banu Sa'd ibn Bakr tribe would send their women annually to collect children.

Halimah bint Abi Dhu'ayb came to Makkah in desperate circumstances — she and her husband were poor, passing through drought, riding a weak she-donkey with insufficient milk even for her own infant. Every nursing woman that year was offered the infant Muhammad ﷺ and declined — he was an orphan, meaning no father to pay the nursing fee. Woman after woman moved on.

By the time every child was taken and the caravan prepared to leave, Halimah had no child. Her husband said: "Perhaps Allah will bless us through him." They took Muhammad ﷺ.

THE BLESSINGS BEGIN IMMEDIATELY: The moment Halimah picked up the infant, her milk flowed abundantly — both the Prophet ﷺ and her own son drank their fill. That night everyone slept fully for the first time in a long while. The she-donkey that had struggled to keep up was suddenly so energetic she outpaced the entire caravan. The people said: "Halimah, slow down!" — the same donkey that had been mocked was leading them all.

At Banu Sa'd's land, the blessings continued. Her goats came home full of milk when others were dry. Her flock grew while neighbours struggled. The people told their herders: "Take your animals where Halimah's daughter takes hers." Such was the barakah of the infant Prophet ﷺ.

THE OPENING OF THE CHEST: When the Prophet ﷺ was approximately four years old, while with his foster brother in the fields, Jibreel (AS) descended, took young Muhammad ﷺ, laid him down, opened his chest, removed his heart, extracted a clot from it, washed the heart in Zamzam water, and returned it. His foster brother ran screaming: "Muhammad has been killed!" They found him standing, pale but physically unharmed.

This is mentioned in the Quran: "Did We not expand your chest for you?" (94:1). The scholars explain it as the removal of the human portion susceptible to Shaytan's whispers, leaving a heart of absolute purity.

Halimah, frightened, brought the child back to Aminah, who was not alarmed: "Do not fear for my son. Great things await him." He had spent four to five years with Banu Sa'd — gaining the purest Arabic tongue in Arabia, the physical strength of the desert, and his first miraculous experience of divine preparation.`,
  },
  {
    episode: 9,
    title: `The Death of Aminah and Care of Abd al-Muttalib`,
    titleAr: `وفاة أمه آمنة ورعاية جده عبد المطلب`,
    year: `576 CE`,
    content: `When Muhammad ﷺ was approximately six years old, his mother Aminah decided to travel to Madinah to visit the grave of his father Abdullah. She took the young Muhammad ﷺ, her servant Umm Ayman (Barakah), and his grandfather Abd al-Muttalib. They spent approximately one month in Madinah — visiting Abdullah's grave, staying with the Banu 'Adi ibn al-Najjar. The young Muhammad ﷺ learned to swim in a pool there and saw for the first time the city that would one day become the capital of Islam and his burial place.

On the return journey, crossing the area of Al-Abwa' between Makkah and Madinah, Aminah fell seriously ill. Despite every effort, she died at Al-Abwa' and was buried there. She was approximately twenty years old.

The six-year-old Muhammad ﷺ watched his mother buried in the desert. He was now fully an orphan.

Years later, when the Prophet ﷺ was an adult, he passed through Al-Abwa' and stopped. He wept, and wept until those around him wept. He said: "I sought permission from my Lord to pray for forgiveness for my mother and He did not permit me. And I sought permission to visit her grave and He permitted me — so visit graves, for they remind you of death."

UNDER ABD AL-MUTTALIB: The child was brought back to Makkah by Umm Ayman and given to his grandfather. Abd al-Muttalib embraced the boy with extraordinary tenderness. A mat would be spread in the shade of the Ka'bah for the chief, and none of his children would sit on it — but young Muhammad ﷺ would sit on it, and when his uncles tried to lift him off, Abd al-Muttalib would say: "Leave my son. By Allah, he will have a great position." He would seat the boy beside him, stroke his back, and be pleased with whatever the boy did.

This love lasted only two years. Abd al-Muttalib died when the Prophet ﷺ was eight years old. The grief of the boy for his grandfather was profound. He followed the funeral bier, weeping.

He had now lost three people meant to be his protection: his father before birth, his mother at age six, his grandfather at age eight. The Prophet of Allah ﷺ was being prepared by something greater than family.`,
  },
  {
    episode: 10,
    title: `Under Abu Talib — Youth and the Journey to Syria`,
    titleAr: `في كنف أبي طالب — الشباب ورحلة الشام`,
    year: `578–595 CE`,
    content: `Abd al-Muttalib entrusted young Muhammad ﷺ to his son Abu Talib — the full brother of Abdullah, the Prophet's father. Abu Talib was a man of honour and genuine love for his nephew. He would protect the Prophet ﷺ for decades against the full might of Quraysh at enormous personal cost. He also died without accepting Islam — one of the most poignant tragedies of the Seerah.

The Prophet ﷺ grew up in Abu Talib's household, which was not wealthy. He tended sheep — the flock of people in Makkah, earning a small wage. He later said: "Every prophet tended sheep." This period gave him connection to the natural world, solitude for reflection, and the patience that shepherding demands.

THE JOURNEY TO SYRIA — BAHIRA THE MONK: When the Prophet ﷺ was approximately twelve years old, Abu Talib prepared a trade caravan to Syria and took Muhammad ﷺ along. Near Busra in Syria, a Christian monk named Bahira had possessed ancient scriptures containing descriptions of the coming final prophet. When he saw the caravan approaching, he noticed something extraordinary: a small cloud travelling with it, shading one specific person from the sun. He invited the entire caravan to a meal — something he had never done before.

He looked at each person without finding what he was looking for. He asked: "Is everyone here?" They said a boy was left with the baggage. He insisted: bring him. When the young Muhammad ﷺ came, Bahira studied him intently — then, with permission, examined the Seal of Prophethood between his shoulder blades: a raised mark mentioned in his scriptures.

Bahira said to Abu Talib: "Take him back to his land and guard him from the Jews. If they see him and recognise in him what I recognise, they will harm him. Great things await this nephew of yours." Abu Talib cut the journey short and sent the boy home with trusted men.

CHARACTER IN YOUTH: As Muhammad ﷺ grew, his character was so exceptional that even the people of Jahiliyyah recognised it. They called him Al-Amin — The Trustworthy — and Al-Sadiq — The Truthful. In a society where deception in trade was normalised, Muhammad ﷺ stood apart. No one could point to a lie he had told.

He also participated in the Hilf al-Fudul — the Pact of the Virtuous — a treaty formed after a man from Yemen was cheated and could get no justice. Noble Makkans convened and swore: "We will be as one hand against the oppressor until the oppressed gets his right." The Prophet ﷺ said later: "I witnessed a pact in Abdullah ibn Jud'an's house that I would not exchange for the best of camels — if I were called to it today under Islam I would respond." `,
  },
  {
    episode: 11,
    title: `Khadijah — The First and Greatest Marriage`,
    titleAr: `السيدة خديجة رضي الله عنها`,
    year: `595 CE`,
    content: `When Muhammad ﷺ was approximately twenty-five years old, his life changed through an encounter with Khadijah bint Khuwaylid — who would become his wife, his first believer, his greatest supporter, and the mother of all his children except Ibrahim.

Khadijah was a wealthy merchant — the most successful trader in Quraysh. She was twice widowed, with children from previous marriages. She was known for her noble character, intelligence, generosity, and business acumen. Men of Quraysh sought her hand and she refused — she had no need of a husband for financial security.

She had heard of Muhammad's ﷺ extraordinary character — his truthfulness and trustworthiness — and offered him the role of leading her trade caravan to Syria with a higher profit share than she gave anyone else.

The journey was successful — unusually so. Her servant Maysarah observed remarkable things: a monk named Nestor saw Muhammad ﷺ and said: "None but a prophet has sat under that tree." He also observed that during intense heat, two angels always shaded Muhammad ﷺ with their wings.

When Maysarah told Khadijah everything, she was already inclined toward Muhammad ﷺ. She consulted her friend Nafisah, who approached Muhammad ﷺ informally: would he consider marriage? To Khadijah? He said: "How could that be possible — she is who she is." Nafisah said: "Leave that to me."

Khadijah proposed. The mahr (dowry) was twenty young camels. Khadijah was approximately forty; Muhammad ﷺ was twenty-five.

Their marriage was one of the most beautiful in Islamic history. For twenty-five years — until her death — he took no other wife. In a society where polygamy was completely normalised, he chose monogamy with the woman he loved.

When Jibreel first came and the Prophet ﷺ returned trembling, Khadijah wrapped him in her cloak and said the words most famous in Seerah: "Never! By Allah, Allah will never disgrace you. You maintain family ties, you speak the truth, you help the poor, you honour your guests, and you help in genuine difficulty."

Allah sent His salam to Khadijah through Jibreel and gave her glad tidings of a house in Paradise made of hollow pearl, with no noise and no toil. The Prophet ﷺ said of her: "She believed in me when the people disbelieved. She accepted me when people rejected me. She supported me with her wealth when people withheld. And Allah blessed me with children through her." The year of her death is called 'Am al-Huzn — the Year of Grief.`,
  },
  {
    episode: 12,
    title: `The Rebuilding of the Ka'bah — Wisdom Prevents War`,
    titleAr: `إعادة بناء الكعبة وحكمة النبي ﷺ`,
    year: `605 CE`,
    content: `Five years before the first revelation, when Muhammad ﷺ was approximately thirty-five years old, an event demonstrated his extraordinary wisdom and prevented what would have been a catastrophic blood feud.

The Ka'bah needed rebuilding. A great flood had weakened its structure, and fire had damaged it further. The Ka'bah at the time was only about four and a half metres high, without a roof, with no raised door. The Quraysh decided to demolish and rebuild it properly.

The work proceeded by clan — each group responsible for a section. Then came the day to install the Black Stone (Al-Hajar al-Aswad) — the sacred stone descended from Paradise. This was the supreme honour — who would lift it and place it in its corner?

Each of the four major clans of Quraysh claimed the right. The dispute escalated rapidly. Abu Umayyah ibn al-Mughirah, the oldest man of Quraysh, suggested: let the first man to enter through the gate tomorrow morning be the judge. They agreed.

The next morning, the first man to enter was Muhammad ibn Abdullah — Al-Amin. The people said: "Al-Amin has come. We are content with him." Every clan was satisfied — his reputation for fairness was beyond question.

He took off his outer garment, spread it on the ground, placed the Black Stone in its centre, and said: "Let one leader from each clan take hold of an edge of the garment." Four men lifted the garment together, carrying the stone to its position. Then Muhammad ﷺ took the stone with his own hands and placed it in its corner.

One act of wisdom avoided a war. The genius of it: every clan participated, every clan had honour, yet only one man placed the stone — the man all trusted.

The Ka'bah was rebuilt higher than before, but the Quraysh didn't have enough righteous funds to build it to its original Ibrahimic foundations — so the northern portion (Al-Hijr or Al-Hateem) was left out, enclosed by a low semicircular wall. This is why tawaf includes going around this area — it is technically part of the original Ka'bah.

The Prophet ﷺ later said to 'Aishah: "If your people were not newly converted from kufr, I would demolish the Ka'bah and rebuild it on the foundations of Ibrahim." This wish was never fulfilled — he prioritised the unity of the new Muslim community.`,
  },
  {
    episode: 13,
    title: `The Cave of Hira — Preparing for Revelation`,
    titleAr: `غار حراء — التهيؤ للوحي`,
    year: `610 CE`,
    content: `In the years approaching forty, something profound was happening in Muhammad's ﷺ inner life. He had always been different — he had never worshipped idols even once in his life, had never consumed alcohol, had never been immoral. But now something new was growing: a need for solitude, for reflection, for being away from the noise of Makkah.

He began going to the mountain of Hira — a rocky mountain about three miles from the Ka'bah. It has a small cave near its summit, barely large enough for a man to sit or lie on his side. He would climb it regularly, staying for days and sometimes a month at a time, taking provisions that Khadijah would bring him.

What did he do there? He prayed, contemplated the heavens and earth, reflected on creation, and sought truth that was not available in the religion of his people. Allah was preparing His messenger.

THE TRUE DREAMS: The preparation began with al-ru'ya al-sadiqah — true dreams. For six months before the revelation, every dream the Prophet ﷺ had came true exactly as he had dreamt it, like the breaking of dawn. His dreams were the first stage of revelation — Allah beginning to train the vessel before pouring in the message.

THE FIRST REVELATION: On the 17th of Ramadan, in the year 610 CE, when Muhammad ﷺ was forty years old and six months, in the cave of Hira on a Monday night — Jibreel (AS) came.

The Prophet ﷺ described what happened: a being appeared and said: IQRA' — Read/Recite. Muhammad ﷺ said: "I am not a reader." The being took him and squeezed him to the limit of his endurance. Released him. IQRA'. He said again: "I am not a reader." Squeezed again, to the limit of endurance. Released. Then for the third time:

"IQRA' BISMI RABBIKALLADHI KHALAQ — Recite in the name of your Lord who created — created man from a clinging substance. Recite, and your Lord is the most Generous — who taught by the pen — taught man that which he knew not." (96:1-5)

The first words of the Quran to touch a human heart. After 600 years of silence from Allah — since the prophethood of 'Isa (AS) — the speech of Allah returned to earth.

The Prophet ﷺ returned home shaking, his heart pounding. He said: "Cover me, cover me." Khadijah wrapped him and held him. When the trembling subsided, he told her everything. And she responded with the famous words of absolute confidence — then took him to Waraqa ibn Nawfal.`,
  },
  {
    episode: 14,
    title: `Waraqa ibn Nawfal and the First Believers`,
    titleAr: `ورقة بن نوفل وأول المؤمنين`,
    year: `610 CE`,
    content: `Khadijah took the Prophet ﷺ to her cousin Waraqa ibn Nawfal — an elderly Christian scholar who had translated portions of the Gospel into Arabic and possessed ancient scriptures describing the coming final prophet.

Khadijah told him everything that had happened in the cave. Waraqa listened, then said: "This is the Namus — the same divine law Allah sent to Musa (AS)." Then: "Would that I were young. Would that I could be alive when your people drive you out." The Prophet ﷺ was startled: "Will they drive me out?" Waraqa said: "Never has a man come with what you have come with except that he was met with hostility. If I live to that day, I will support you with the strongest support."

Waraqa died shortly after — before the public preaching began — having believed and confirmed, but not witnessed the fullness of what was coming. The Prophet ﷺ later said: "I saw him in a dream wearing white garments — if he were among the people of Hellfire he would not have been wearing white."

THE FIRST BELIEVERS:

KHADIJAH (RA) was first — she believed before any question was asked, before any evidence was given. Her acceptance was immediate and total.

ALI IBN ABI TALIB (RA) — approximately ten years old, living in the Prophet's ﷺ household — found the Prophet ﷺ and Khadijah praying together. He thought through the night, then came back: "Allah created me without consulting Lat and Uzza — why should I consult them now?" He was the first child of Islam.

ZAYD IBN HARITHAH (RA) — the Prophet's ﷺ freed slave who had been given the choice to return to his family or stay, and chose to stay. When prophethood came, his acceptance was immediate. He is the only companion named by name in the Quran (33:37).

ABU BAKR AL-SIDDIQ (RA) — the first free adult man. The Prophet ﷺ said: "I never invited anyone to Islam who did not hesitate and question except Abu Bakr — he did not hesitate for a moment." Through Abu Bakr came: Uthman ibn Affan, Abd al-Rahman ibn 'Awf, Sa'd ibn Abi Waqqas, Zubayr ibn al-Awwam, and Talhah ibn Ubaydullah — five of the ten promised Paradise, all brought through one man in the first days of Islam.`,
  },
  {
    episode: 15,
    title: `Three Years of Secret Dawah`,
    titleAr: `ثلاث سنوات من الدعوة السرية`,
    year: `610–613 CE`,
    content: `After the first revelation and the first believers, the Prophet ﷺ conducted dawah (call to Islam) in secret for approximately three years — person by person, household by household, in trusted private gatherings.

This was not timidity. The first revelations focused on building creed, character, and connection to Allah. Before the Prophet ﷺ could carry the message to all humanity, the first generation needed to be built internally — their faith unshakeable, because what was coming would shake everything.

The early Muslims gathered primarily in Dar al-Arqam — the house of al-Arqam ibn Abi al-Arqam on the eastern slope of Mount Safa. Here the Prophet ﷺ would teach, new Muslims could come privately, and the Quran was recited and explained.

BILAL IBN RABAH (RA): An Abyssinian slave owned by Umayyah ibn Khalaf. When Bilal accepted Islam, Umayyah would drag him onto the burning sand of Makkah at midday, lay him on his back, place an enormous rock on his chest, and demand: "Deny Muhammad and worship Lat and Uzza." Bilal's response — always — was "Ahad, Ahad" (One God, One God). Abu Bakr purchased his freedom for an enormous sum. Twenty years later, Bilal would watch Umayyah cut down at Badr by the men of Islam.

THE FAMILY OF YASIR: Yasir, his wife Sumayyah, and their son Ammar — a family with no powerful tribal protection. Their torture was carried out publicly. Sumayyah bint Khabbat was stabbed to death by Abu Jahl with a spear — making her the first martyr in Islamic history, male or female. Yasir died under torture. Ammar was forced to say words of disbelief under extreme duress — and Allah revealed: "Except for one who is compelled while his heart is firm in faith." (16:106)

KHABBAB IBN AL-ARATT (RA): A blacksmith pressed against burning coals by his owner. He never abandoned Islam.

These three years were years of invisible root growth — essential to everything that came after. Every tree that stands in a storm first needs invisible roots. The first Muslims were those roots.`,
  },
  {
    episode: 16,
    title: `The Command to Go Public — Dawah Begins`,
    titleAr: `الأمر بالجهر بالدعوة`,
    year: `613 CE`,
    content: `After three years of secret dawah, Allah commanded His Prophet ﷺ to go public: "So proclaim what you are commanded and turn away from the polytheists." (15:94). And: "Warn your close kindred." (26:214). The period of quiet growth was over.

THE FEAST AND MOUNT SAFA: The Prophet ﷺ first gathered the Banu Hashim — his own clan — for a private feast, then called them to Islam. Abu Lahab dismissed the gathering with contempt. Undeterred, the Prophet ﷺ climbed Mount Safa — the highest public point in Makkah — and called out the emergency warning cry "Ya Sabahah!" The people of Makkah stopped. Every clan was represented. They came running.

The Prophet ﷺ said: "If I told you that an army was coming from behind this mountain to attack you — would you believe me?" They said: "We have never known you to lie." He said: "Then I am a warner to you of a severe punishment ahead."

Abu Lahab said: "May you perish for the rest of the day! Is this why you gathered us?" Then he left. Allah immediately revealed Surah Al-Masad (111), condemning him and his wife by name, promising them Hellfire. This surah was revealed while Abu Lahab was still alive and capable of converting — and he never did. The fact he died a disbeliever despite the open challenge was itself evidence of the Quran's miraculous nature: it predicted he would die a disbeliever, and so he did.

THE QURAYSHI RESPONSE: Swift, multi-pronged, and often savage.

THE INTELLECTUAL ATTACK: Al-Walid ibn al-Mughirah — the most intelligent man of Quraysh — was sent to listen to the Quran and report back. He listened and came back changed — he could not deny what he had heard. But instead of accepting, he forced himself to produce a counter-narrative: call it magic. The Quraysh told pilgrims arriving for Hajj: he is a magician, a poet, a soothsayer, a madman. The designations kept changing because none of them fit — each objection was countered by the reality of who the Prophet ﷺ actually was.

THE SOCIAL STRATEGY: They told tribes: if you shelter Muhammad, we will cut trade with you. They instructed their followers to harass him in the streets. Abu Jahl would sit near the Ka'bah and publicly mock him, hoping to wear him down through shame.

The Prophet ﷺ persisted. Every morning he returned. Every Hajj season he preached to pilgrims. The Quran kept coming, addressing each situation, building the case for the One God with an eloquence that no Arabic tongue could match.`,
  },
  {
    episode: 17,
    title: `The Torture of the Early Muslims`,
    titleAr: `تعذيب المسلمين الأوائل`,
    year: `613–615 CE`,
    content: `When the Prophet ﷺ went public, the Quraysh's response moved from mockery to violence. The persecution of the early Muslims is one of the most harrowing chapters in Islamic history — and one of the most revealing about those who endured it.

The pattern was systematic: those with powerful tribal protection were relatively safer. But those without — slaves, freed men, women, those from weak tribes — were utterly exposed.

The attacks on the Prophet ﷺ himself were also severe despite tribal protection. 'Uqbah ibn Abi Mu'ayt once wrapped his cloak around the Prophet's ﷺ neck and twisted it until he nearly lost consciousness — Abu Bakr ran and physically pushed 'Uqbah away, screaming: "Would you kill a man for saying 'My Lord is Allah'?" Abu Jahl once had animal entrails thrown on the Prophet ﷺ while he prayed at the Ka'bah. His daughter Fatimah came and cleaned it from him, weeping. The Prophet ﷺ made du'a against those responsible by name — seven of them were killed at Badr.

Umm Jamil — Abu Lahab's wife, described in the Quran as "the carrier of firewood" — would gather thorny branches and scatter them in the Prophet's ﷺ path at night.

WHAT SUSTAINED THE EARLY MUSLIMS? The Quran. Specifically the Makkan surahs of this period — short, powerful, rhythmic, addressing the soul directly. "Did We not expand for you your chest?" "By the morning brightness, and the night when it covers." "O soul at peace — return to your Lord well-pleased and pleasing." These were not just recitations — they were the direct word of Allah sustaining His servants through suffering that, in any material calculation, made no sense to endure.

And the Prophet ﷺ himself. He never abandoned them. He prayed for them. He tried to purchase the freedom of those enslaved. He validated their suffering as meaningful. He promised them Paradise by name.

This was the community that endured — because of the message, and because of the man who carried it.`,
  },
  {
    episode: 18,
    title: `The First Hijrah — Flight to Abyssinia`,
    titleAr: `الهجرة الأولى إلى الحبشة`,
    year: `615 CE`,
    content: `As persecution intensified, the Prophet ﷺ authorised a migration to Abyssinia (modern Ethiopia), ruled by the Negus (al-Najashi), a king renowned for his justice. He said: "In Abyssinia there is a king under whom no one is wronged. Go to him until Allah makes a way out for you."

Approximately twelve men and four women set out secretly, crossing the Red Sea to Abyssinia. This was the first hijrah in Islam. Among them were Uthman ibn Affan (RA) and his wife Ruqayyah — the Prophet's ﷺ own daughter.

QURAYSH'S PURSUIT: Quraysh sent Amr ibn al-As and Abdullah ibn Abi Rabia to the Negus with expensive gifts, asking for extradition: "These people have abandoned our religion and adopted a new one that is neither our religion nor yours."

THE NEGUS LISTENS: The Negus refused to hand them over without hearing their side. Ja'far ibn Abi Talib stood as spokesman and delivered one of the most famous speeches in Seerah:

"O King, we were a people of ignorance — we worshipped idols, ate dead animals, committed indecency, severed family ties, and the strong among us devoured the weak. Then Allah sent us a messenger from among ourselves, whose lineage, truthfulness, trustworthiness, and chastity we knew. He called us to Allah alone and to abandon what we and our forefathers worshipped of stones and idols. He commanded us to be truthful in speech, to fulfil our trusts, to maintain family ties, to be good to neighbours, to refrain from forbidden things and bloodshed."

The Negus asked: "Do you have anything of what he brought from Allah?" Ja'far recited the opening of Surah Maryam — verses about Mary and the miraculous birth of 'Isa (AS). The Negus wept. His bishops wept. He said: "By Allah, what Jesus brought and what this man has brought come from the same source — they do not differ by even this much." He turned to the Qurayshi envoys: "I will not hand these people over." He returned their gifts and dismissed them.

The Negus died years later as a Muslim. The Prophet ﷺ prayed the funeral prayer for him in absentia — the first such prayer in Islamic history. He was buried in Abyssinia — a king who, when given the choice between worldly political convenience and truth, chose truth.`,
  },
  {
    episode: 19,
    title: `The Boycott and Confinement of Banu Hashim`,
    titleAr: `حصار بني هاشم في شعب أبي طالب`,
    year: `616–619 CE`,
    content: `When the Qurayshi leadership realised that the early strategies — mockery, torture, counter-arguments — were not stopping Islam's growth, they escalated to an economic and social siege: a total boycott of Banu Hashim and their allies.

The document was written and hung inside the Ka'bah to give it religious weight. It declared: no Qurayshi clan was to buy from, sell to, marry with, or have any social dealings with Banu Hashim until they surrendered Muhammad ﷺ to be killed.

The effect was severe. Banu Hashim — Muslims and non-Muslims alike (Abu Talib and others who hadn't accepted Islam but protected the Prophet ﷺ were equally targeted) — were forced to withdraw to a mountain pass called Shi'b Abi Talib. For three years they were confined there.

CONDITIONS DURING THE BOYCOTT: The narrations describe genuine deprivation. Food and supplies were cut off — they ate leaves from trees. Children cried from hunger. The sound of wailing could be heard from outside the pass. Some companions described the humiliation of trying to smuggle food in at night. Khadijah (RA) spent large portions of her remaining wealth trying to sustain the community. Her health suffered visibly during this period.

THE END OF THE BOYCOTT: After three years, a group of Qurayshi nobles — sickened by what was being done to their kin — moved to end the boycott. Hisham ibn Amr was the most active in organising this. He gathered four others: Zuhayr ibn Abi Umayyah, Mutim ibn 'Adi, Abu al-Bukhtari ibn Hisham, and Zam'a ibn al-Aswad.

They went to the Ka'bah to tear up the document. But when they reached it, they found it had been eaten by termites — every word had been consumed except the Name of Allah at the top. When this was reported to Abu Talib and the Prophet ﷺ, the Prophet ﷺ said that Jibreel had informed him this was coming. The boycott collapsed.

But the three years had taken their toll. Khadijah was weakened. Abu Talib was aged. The community emerged from the pass into a changed city — and within months, both of his greatest protections would be gone.`,
  },
  {
    episode: 20,
    title: `The Year of Grief — Deaths of Khadijah and Abu Talib`,
    titleAr: `عام الحزن — وفاة خديجة وأبي طالب`,
    year: `619 CE`,
    content: `The tenth year of prophethood is known as 'Am al-Huzn: the Year of Grief. Within weeks, the Prophet ﷺ lost the two human beings who had been his primary supports — one the shelter of his heart, one the shield of his public life.

THE DEATH OF KHADIJAH (RA): She had been his wife for twenty-five years. For the entire decade of prophethood, she had been his first refuge after every difficulty. She bore him six children. She spent her entire wealth in Islam without hesitation.

She died weakened by the three-year boycott. She was sixty-five years old. The Prophet ﷺ washed her and buried her in Jannat al-Mu'alla. His grief was visible and profound. Years later, 'Aishah said: "I was never jealous of any wife of the Prophet ﷺ as I was jealous of Khadijah, though I never met her." She had died before 'Aishah came into his life.

When 'Aishah once said "Allah has given you better than her," the Prophet's ﷺ response was immediate: "Allah did not give me better than her. She believed in me when the people disbelieved. She accepted me when people rejected me. She supported me with her wealth when people withheld. And Allah blessed me with children through her." Belief, acceptance, support, children. She was first in all of them.

THE DEATH OF ABU TALIB: He was the man who had protected the Prophet ﷺ for a decade as chief of Banu Hashim. When he lay dying, the Prophet ﷺ sat at his bedside: "O uncle, say 'La ilaha illallah' — a word with which I can defend you before Allah." Abu Jahl and others present kept saying: "Will you abandon the religion of Abd al-Muttalib?" The Prophet ﷺ pleading, the enemies countering. Abu Talib's last words were: "I am on the religion of Abd al-Muttalib." He died without the testimony.

Allah revealed: "Indeed, you do not guide whom you love — but Allah guides whom He wills." (28:56) — revealed specifically about Abu Talib.

The death of Abu Talib left the Prophet ﷺ without his tribal shield. The Quraysh immediately became bolder. A man threw dirt on the Prophet's ﷺ head in the street — inconceivable while Abu Talib lived. The Prophet ﷺ went home with dirt on his head and Fatimah washed it while weeping. He said: "Do not weep, my daughter — Allah will protect your father." `,
  },
  {
    episode: 21,
    title: `Ta'if — The Most Difficult Day`,
    titleAr: `الطائف — أشد يوم في حياة النبي ﷺ`,
    year: `619 CE`,
    content: `After the deaths of Khadijah and Abu Talib, the Prophet ﷺ made a journey he himself described as the most difficult day of his life — to Ta'if, approximately 60 miles through the mountains, seeking tribal protection and hoping to find an audience for Islam.

He walked. Not rode — walked. With him was only Zayd ibn Harithah (RA).

THE MEETING WITH THE THREE LORDS OF THAQIF: The leadership of Ta'if was in the hands of three brothers. Each responded with contempt worse than the last. One said: "If Allah truly sent you as a messenger, I'll tear the cloth of the Ka'bah." Another: "Couldn't Allah find anyone better than you to send?" The third: "By Allah, I will never speak to you again. If you are a Prophet, you are too great for me to reply to. And if you are lying about Allah, you are not fit to be spoken to."

THE EXPULSION: They set their slaves and street children on him. As the Prophet ﷺ and Zayd left, the mob followed them, pelting them with stones, drawing blood from his legs and feet. Zayd tried to shield him with his own body and received wounds to his head. The mob drove them out approximately three miles.

The Prophet ﷺ sat down, bleeding, in an orchard belonging to his enemies — 'Utbah and Shaybah ibn Rabi'ah. He raised his hands to Allah:

"O Allah, to You I complain of my weakness and helplessness and insignificance before people. O most Merciful of those who show mercy — You are the Lord of the weak and You are my Lord. To whom would You entrust me? To a distant stranger who treats me harshly? Or to an enemy whom You have given authority over me? If You are not angry with me then I do not care — but Your grace is broader for me. I seek refuge in the light of Your countenance by which the darknesses are lit..."

JIBREEL AND THE ANGEL OF THE MOUNTAINS: While he sat, the Angel of the Mountains came and said: "If you command me, I will bring together the two mountains that surround Ta'if and crush them." The Prophet ﷺ said: "No — I hope that Allah will bring from their descendants people who will worship Allah alone and associate nothing with Him."

He chose mercy over justice for those who had stoned him. Twenty years later the Thaqif tribe accepted Islam in full. 'Aishah (RA) asked the Prophet ﷺ: "Was there a day harder for you than the day of Uhud?" He said: "I suffered from your people — and the hardest was the day of Ta'if." `,
  },
  {
    episode: 22,
    title: `Al-Isra' wal-Mi'raj — The Night Journey and Ascension`,
    titleAr: `الإسراء والمعراج`,
    year: `619–621 CE`,
    content: `In the darkest period of the mission — after the deaths of Khadijah and Abu Talib, after Ta'if — Allah honoured His Prophet ﷺ with the greatest journey a human being has ever made.

AL-ISRA': Jibreel (AS) came to the Prophet ﷺ and transported him on al-Buraq — a white creature whose stride reached as far as its eye could see — from the Masjid al-Haram to the Masjid al-Aqsa in Jerusalem, in a single night.

At Al-Aqsa, all the previous prophets were assembled — Ibrahim, Musa, 'Isa, Nuh, and the rest (AS). The Prophet ﷺ was given two vessels — one of wine, one of milk — and chose the milk. Jibreel said: "You have chosen the fitra (natural disposition)." He led all the prophets in prayer as their imam — the seal of all prophethood, leading all who preceded him.

AL-MI'RAJ: From Jerusalem, Jibreel took him upward through the seven heavens. At each gate: "Who is this?" "Muhammad." "Has he been sent for?" "Yes." 

In the first heaven: Adam (AS), laughing to his right and weeping to his left — the souls of the blessed and the damned among his descendants.
In the second: 'Isa and Yahya (AS).
In the third: Yusuf (AS) — given half of all beauty.
In the fifth: Harun (AS).
In the sixth: Musa (AS) — who wept, saying: "A young man has been sent after me whose followers will enter Paradise in greater numbers than my followers."
In the seventh: Ibrahim (AS) — leaning against the Bayt al-Ma'mur, the heavenly Ka'bah circumambulated by 70,000 angels daily who never return again.

SIDRAT AL-MUNTAHA: Beyond the seven heavens, the Prophet ﷺ reached the Lote Tree of the Utmost Boundary — the furthest point any creation has reached. Jibreel stopped: "If I advance one more step, I will burn up." The Prophet ﷺ went on alone — the only human being to go beyond where even Jibreel can go.

He was given three things: the final verses of Surah Al-Baqarah, forgiveness for those of his Ummah who do not commit shirk, and the command to pray fifty times daily. On the descent, Musa (AS) kept advising him to return and ask for reductions. Each time he returned, the number decreased — until five prayers remained, carrying the reward of fifty.

When the Prophet ﷺ told Makkah the next morning, some Muslims wavered. Some apostasized. Abu Bakr's response when told: "If he said it, I believe it" — confirming the title Al-Siddiq forever.

For the Muslim in every generation, Al-Isra' wal-Mi'raj is Allah's testimony to His Prophet ﷺ in the darkest hour: you are not abandoned. You are the most honoured of all creation. The prayer — given on this night — is the daily Mi'raj of every believer.`,
  },
  {
    episode: 23,
    title: `The Pledges of Aqabah — Madinah Opens`,
    titleAr: `بيعتا العقبة — انفتاح المدينة`,
    year: `620–622 CE`,
    content: `Even as Makkah hardened against the Prophet ﷺ, Allah was preparing a new home for Islam in Yathrib — approximately 400 kilometres to the north, a city that would become al-Madinah al-Munawwarah (the City of Light).

Yathrib was different from Makkah in every important way. Two major Arab tribes (Aws and Khazraj) and three Jewish tribes coexisted in perpetual tension. The Battle of Bu'ath — fought between Aws and Khazraj just before the Hijra — had devastated both sides. They were exhausted by conflict and searching for something that could unify them.

THE FIRST CONTACT (620 CE): During the Hajj season, the Prophet ﷺ approached six men from Khazraj. They said to each other: "This is the prophet the Jews have been warning us about — let us not let them get to him first." All six accepted Islam and returned as the first missionaries of Islam in Yathrib.

THE PLEDGE OF AQABAH I (621 CE): Twelve men from Yathrib met the Prophet ﷺ secretly at the mountain pass called Aqabah near Mina. They pledged the "Women's Pledge" — no fighting commitment, only personal morality: worship Allah alone, do not steal, do not fornicate, do not kill children, do not slander, obey the Prophet ﷺ in what is right.

The Prophet ﷺ sent Mus'ab ibn 'Umayr back with them as the first official Muslim teacher — a young man who had given up wealth and silk for Islam. Within a year, Islam had spread through Yathrib such that there was hardly a household without Muslims.

THE PLEDGE OF AQABAH II (622 CE): The following Hajj, 73 men and 2 women from Yathrib met the Prophet ﷺ at Aqabah deep in the night. Abbas ibn Abd al-Muttalib — still not Muslim — said: "If you take him, protect him as you would protect your own kin." The Yathribis pledged to protect him with their lives.

The Prophet ﷺ accepted. He asked for twelve leaders (nuqaba'). One of the Ansar asked: "What do we get if we fulfil this pledge?" He said: "Paradise." They said: "Then extend your hand." He extended his hand. They pledged on it.

This night at Aqabah was the political birth of the Islamic state. The Hijra would follow within months.`,
  },
  {
    episode: 24,
    title: `The Hijra — Flight to Madinah`,
    titleAr: `الهجرة إلى المدينة المنورة`,
    year: `622 CE / 1 AH`,
    content: `The Hijra — the migration of the Prophet ﷺ from Makkah to Madinah — is the most consequential journey in Islamic history. The Islamic calendar begins from it: the moment the Muslim community became a sovereign entity.

QURAYSH'S PLOT: Learning of the Second Pledge of Aqabah, Quraysh convened an emergency council. They decided to choose one strong young man from each clan to strike the Prophet ﷺ simultaneously, so his blood would be spread across all clans and Banu Hashim — unable to fight all of Quraysh at once — would accept blood money instead.

The Prophet ﷺ was divinely informed. He went to Abu Bakr's house. "We are leaving tonight." Abu Bakr wept for joy — he had been waiting for this permission for months.

That night, the assassins surrounded the Prophet's ﷺ house. Inside, Ali ibn Abi Talib (RA) was told to sleep in the Prophet's ﷺ bed, wrapped in his green mantle. Ali accepted without hesitation — lying down where the assassins intended to kill.

The Prophet ﷺ came out among the assembled assassins — they could see him physically, but Allah had covered their perception. He recited: "And We have covered them so they do not see." He scattered dust on their heads as he walked through them. By morning they found the dust on their heads and understood — too late.

THE CAVE OF THAWR: They hid in a cave south of Makkah for three days. Quraysh offered 100 camels for anyone who captured either of them. Search parties came directly to the cave. Abu Bakr whispered: "If one of them looks down, he will see us." The Prophet ﷺ replied with words Allah immortalised: "Do not grieve — Allah is with us." (9:40). A spider had spun its web across the cave entrance. Doves had nested at the entrance. The search party concluded no one could have entered recently and moved on.

After three days they set out along the Red Sea coast. A tracker named Suraqa ibn Ju'shum caught up — his horse stumbled into the ground three times. He called out: I mean no harm. The Prophet ﷺ said: "What if you had on your wrists the bracelets of Kisra?" Years later, Suraqa accepted Islam — and Umar placed the conquered Persian emperor's golden bracelets on his wrists, weeping.

THE ARRIVAL: The entire city of Madinah came out. Women and children sang from rooftops: "Tala'al badru alayna — the full moon has risen upon us." The Prophet ﷺ let his camel walk freely and built his mosque where it knelt. The Hijra was complete. Year One of the Islamic calendar had begun.`,
  },
  {
    episode: 25,
    title: `Building Madinah — Mosque, Brotherhood, and Constitution`,
    titleAr: `بناء المدينة — المسجد والمؤاخاة والدستور`,
    year: `1 AH / 622–623 CE`,
    content: `The Prophet ﷺ arrived in Madinah not just as a refugee but as a statesman. Within months he had laid the political, social, and spiritual foundations of a new civilisation.

THE MASJID AL-NABAWI: The first institution built was the mosque. The Prophet ﷺ purchased the land from two orphan boys who tried to gift it — he insisted on paying. Date palms were cut, stones gathered, and the entire community participated in construction. The Prophet ﷺ carried stones alongside the workers. His companions said: "If we sit while the Prophet works, that is going astray."

The mosque was simple: mud brick walls, roof of palm fronds, pillars of date palm trunks. The Prophet's ﷺ own chambers — small rooms adjacent — were so low a man of normal height could touch the ceiling. He chose this deliberately and maintained this simplicity for the rest of his life.

Beside the mosque, the Suffah — a raised area where the poor and homeless companions (Ahl al-Suffah) lived permanently — became the first Islamic seminary, with students memorising Quran and learning Sunnah.

AL-MU'AKHA — THE BROTHERING: The Prophet ﷺ paired each Muhajir (migrant from Makkah) with an Ansar (helper from Madinah) in a bond of brotherhood — at least initially including rights of inheritance.

Abd al-Rahman ibn 'Awf was paired with Sa'd ibn al-Rabi'. Sa'd offered: "Take half of my wealth. I have two wives — I will divorce whichever you choose." Abd al-Rahman — who had arrived with literally nothing — said: "May Allah bless you in your wealth. Just show me the marketplace." Within a short time he was trading and had rebuilt his life. The spirit of the Ansar was that extraordinary.

THE CONSTITUTION OF MADINAH: The Prophet ﷺ drafted one of the earliest written constitutional documents in human history — regulating the relationships between Muhajirin, Ansar, and the Jewish tribes. Key clauses: the Muslims are one community; each group maintains its own customs; no believer will support a disbeliever against a believer; all disputes are referred to Allah and Muhammad ﷺ; the protection of the lowest believer is binding on all.

THE ADHAN: Abdullah ibn Zayd al-Ansari saw in a dream the specific words of the adhan. He rushed to the Prophet ﷺ in the morning. The Prophet ﷺ confirmed: "This is a true vision." Umar (RA) had seen the same. Bilal was chosen to call — his deep, powerful voice the first to say the adhan over a city.

"Allahu Akbar... Allahu Akbar... Ashhadu an la ilaha illallah... Ashhadu anna Muhammadar rasulullah... Hayya alas-salah... Hayya alal-falah... Allahu Akbar... La ilaha illallah."

For the first time, this sound went out over a city. The rhythm of Islamic life — built around five daily calls — was established. It continues in every city with Muslims on earth, unceasingly, to this day.`,
  },
  {
    episode: 26,
    title: `The Change of Qiblah and Early Laws of Madinah`,
    titleAr: `تحويل القبلة وأوائل الأحكام`,
    year: `1–2 AH`,
    content: `In the first two years in Madinah, the Quran descended rapidly addressing the practical needs of the new community — legislation, social organisation, and theological deepening.

THE CHANGE OF QIBLAH: For sixteen months after the Hijra, the Muslims prayed facing Jerusalem. The Prophet ﷺ longed to pray toward the Ka'bah. He would look up at the sky while praying as if waiting. Then came: "We have certainly seen you turning your face toward the heaven — so We will surely turn you toward a qiblah with which you will be pleased. Turn your face toward the Sacred Mosque." (2:144)

The change happened during the Dhuhr prayer at the mosque of Banu Salamah. In the middle of the prayer — during the second rak'ah — the Prophet ﷺ turned 180 degrees to face Makkah. The men and women rotated to follow him, completing the prayer facing the new direction. This mosque became Masjid al-Qiblatain — the Mosque of the Two Qiblahs — still standing in Madinah today.

The Jewish tribes used this change as an attack: "Muhammad has gone back to the qiblah of his forefathers." The Quran responded: "To Allah belongs the east and the west — He guides whom He wills to the straight path."

RAMADAN AND ZAKAT: In 2 AH, fasting in Ramadan became obligatory: "O you who believe, fasting is prescribed for you as it was prescribed for those before you, that you may become righteous." (2:183). The obligation of Zakat with specific rates and categories of recipients was also established.

THE PERMISSION TO FIGHT: Also in this period came the first revelation permitting armed conflict: "Permission has been given to those who are being fought, because they were wronged." (22:39). For thirteen years the Muslims had been commanded to endure, migrate, and absorb violence without retaliating. Now permission was given — with precise conditions: it must be defensive, proportional, with women, children, the elderly, clergy, and farmers explicitly protected.

MARRIAGE AND THE PROPHET'S ﷺ HOUSEHOLD: The Prophet ﷺ married 'Aishah bint Abi Bakr in this period. She would become one of the greatest scholars in Islamic history — the source of one-third of the rulings of Islamic jurisprudence by some scholarly estimates. Her room adjacent to the mosque became a classroom from which she taught scholars for decades after the Prophet's ﷺ death.`,
  },
  {
    episode: 27,
    title: `The Battle of Badr — The Day of Furqan`,
    titleAr: `غزوة بدر — يوم الفرقان`,
    year: `2 AH / 624 CE`,
    content: `The Battle of Badr — fought on the 17th of Ramadan, 2 AH — was the first major military engagement of Islam. The Quran calls it Yawm al-Furqan: the Day of Criterion. Its outcome transformed the Muslim community from a persecuted religious group into a recognised political and military force.

THE SETUP: Abu Sufyan was leading a massive Qurayshi trade caravan from Syria — 1,000 camels, merchandise worth 50,000 gold dinars. The Prophet ﷺ decided to intercept it with approximately 313 men — a small, poorly equipped force with only 2 horses and 70 camels. But Abu Sufyan received warning and mobilised Makkah. A Qurayshi army of approximately 950 men — armoured, with 100 horses — marched out. Abu Sufyan's caravan escaped. The Qurayshi army, led by Abu Jahl, refused to turn back: "We will go to Badr and the Arabs will hear of our strength."

THE NIGHT BEFORE: The Prophet ﷺ prayed all night. Sa'd ibn Mu'adh (RA) said: "O Prophet of Allah, by Allah, if you were to take us to the sea and plunge into it, we would plunge with you. Not one of us would stay behind." Then the two armies met at the wells of Badr.

THE BATTLE: The Prophet ﷺ arrayed his force with extraordinary tactical precision — walking the battlefield the night before and pointing: "This man will die here, this man there." The next day, each man fell exactly as predicted.

The battle opened with individual combat. Hamzah ibn Abd al-Muttalib killed Shaybah ibn Rabi'ah. Ali ibn Abi Talib killed Al-Walid ibn Rabi'ah. The armies then engaged fully.

THE ANGELS: Allah sent a thousand angels. The Quran confirmed: "I will reinforce you with a thousand angels following in succession." Companions reported seeing men on grey horses with white and yellow turbans — men they did not recognise. The earth seemed to swallow Quraysh in sections no visible Muslim had reached.

THE OUTCOME: 70 Qurayshi men were killed. 70 were captured. Among the dead: Abu Jahl — "the Pharaoh of this nation" as the Prophet ﷺ called him — cut down by two young Ansari men. Also Umayyah ibn Khalaf — killed by Bilal, his former slave whom he had tortured on burning sand. The Muslims lost 14 men.

THE PRISONERS: They were fed, clothed, and ransomed. Educated prisoners who had no money for ransom were asked to teach ten Muslim children to read in exchange for their freedom. Education as ransom — the first such exchange in human history. Badr established three things: that the Muslim community could defend itself, that Allah's promise of victory was real, and that the old hierarchy of Makkah could be brought down.`,
  },
  {
    episode: 28,
    title: `The Battle of Uhud — Trial and Lesson`,
    titleAr: `غزوة أحد — الابتلاء والدرس`,
    year: `3 AH / 625 CE`,
    content: `One year after Badr, the Muslims faced the most severe military trial of the Madinan period. The Battle of Uhud is studied not for the victory but for what it teaches about human nature, obedience, and the wisdom of trials.

THE QURAYSHI RESPONSE TO BADR: The defeat at Badr had humiliated Quraysh. Abu Sufyan vowed not to rest until he had taken revenge. Quraysh mobilised 3,000 men — 700 armoured, 200 horses, 3,000 camels. Women came with the army, led by Hind bint Utbah whose father and brother had been killed at Badr.

THE CRUCIAL COMMAND — THE ARCHERS: The Prophet ﷺ positioned 50 archers on a rocky hill (Jabal al-Rumah) under Abdullah ibn Jubayr. His command was explicit and emphatic — repeated multiple times: "Protect our backs. Do not abandon your position whether we are winning or losing. If you see the birds eating our flesh, do not leave. If you see us taking spoils, do not come to us."

THE FIRST PHASE: The Muslims fought brilliantly. Hamzah ibn Abd al-Muttalib (RA) was a force unto himself. The battle shifted decisively in the Muslim favour. Quraysh began to break. The moment victory seemed at hand, approximately 40 of the 50 archers abandoned their posts to collect spoils, reasoning: "The enemy is fleeing — what more is there to protect?" Abdullah ibn Jubayr called after them: "Remember what the Prophet commanded you!" Ten stayed. Forty left.

THE TURNING POINT: Khalid ibn al-Walid — then still a Qurayshi commander — saw the hill empty and led his cavalry around it in a pincer movement, killing the remaining ten archers and crashing into the Muslim rear. The Muslim army was thrown into chaos. A rumour spread: "Muhammad has been killed!" Some companions sat down, certain it was over.

THE PROPHET ﷺ WOUNDED: The Prophet ﷺ was struck by a stone — breaking one of his teeth, cutting his face so that blood ran. He fell into a pit. He was not dead. He said: "How can a people succeed who bloodied the face of their Prophet while he calls them to their Lord?"

Mus'ab ibn 'Umayr (RA) — the first teacher of Islam, the man who had given up silk for the message — was martyred carrying the standard. He held it first with his right arm when that was cut, then with his left arm when that was cut, then with his bleeding stumps pressed to his chest, until he fell.

THE LESSON: The Quran devoted more than 60 verses of Surah Aal-Imran to Uhud. It does not deny the disaster but explains it: "What you suffered was from yourselves." The disobedience of the archers. The rush for spoils. But: "Do not be weak, do not grieve, and you will be superior if you are true believers." (3:139). And: "Do not think of those killed in the way of Allah as dead — they are alive, receiving provision from their Lord." (3:169). The 70 Muslim martyrs of Uhud — buried on that mountain — are visited by millions every year.`,
  },
  {
    episode: 29,
    title: `The Battle of the Trench — Ahzab`,
    titleAr: `غزوة الخندق — الأحزاب`,
    year: `5 AH / 627 CE`,
    content: `Two years after Uhud, the Quraysh mounted what they intended to be the final decisive assault on Madinah — a coalition (Ahzab — the Confederates) of virtually every major tribe opposed to Islam: Quraysh, Ghatafan, Banu Sulaym, Banu Asad, and others — approximately 10,000 men total.

SALMAN'S BRILLIANT IDEA: Salman al-Farisi (RA) — the Persian companion who had converted after a lifetime of searching for truth — proposed something completely novel to Arab warfare: a defensive trench around the exposed northern side of Madinah. The other sides were protected by lava fields and date palm groves. The entire Muslim community dug — approximately 3,000 fighters, including the Prophet ﷺ himself alongside the workers.

THE MIRACLES OF DIGGING: The hardship was extreme — cold, hungry, with 10,000 men approaching. When they found a stone their tools could not break, the Prophet ﷺ struck it with his pickaxe — three times, each producing a flash of light. With each strike he said: "I have been given the keys of Syria... I have been given the keys of Persia... I have been given the keys of Yemen." Three promises. Three civilisations. All fulfilled within twenty years.

THE SIEGE: The Confederate army arrived and found the trench. They were bewildered — they had never encountered this tactic. They camped for twenty-five days unable to cross. Only Amr ibn Abd Wudd — a warrior of legendary reputation — actually made it across with a small group. He called for single combat. Ali ibn Abi Talib (RA) volunteered and killed him. The others retreated.

THE BANU QURAYZA TREACHERY: The Banu Qurayza — the last remaining Jewish tribe in Madinah, who had a treaty of mutual defence with the Muslims — were persuaded by the Confederates to break their treaty. The Muslims were suddenly surrounded from north and south.

NU'AYM IBN MAS'UD — THE INTELLIGENCE AGENT: A man from Ghatafan came to the Prophet ﷺ secretly, having become Muslim without his tribe knowing. The Prophet ﷺ said: "Sow discord between them — war is deception." Nu'aym planted mutual suspicion between the Banu Qurayza and the Confederates until each side became deeply suspicious of the other. The coalition began to fracture.

THE DIVINE WIND: Allah sent a bitter, freezing storm — so cold that tent pegs were ripped out and no fire could stay lit. Abu Sufyan stood and said: "Men of Quraysh — the animals are dying, the Banu Qurayza have failed us, the wind has destroyed us. I am leaving — follow me." The coalition collapsed.

The Prophet ﷺ said to his companions: "From now on we go to them — they will not come to us." The defensive posture of the early Madinan period was over. Islam would now advance.`,
  },
  {
    episode: 30,
    title: `Al-Hudaybiyyah — The Treaty That Looked Like Defeat`,
    titleAr: `صلح الحديبية — فتح مبين`,
    year: `6 AH / 628 CE`,
    content: `The Treaty of Hudaybiyyah appeared to the Companions as a humiliating defeat. The Prophet ﷺ accepted it with full conviction. Allah described it as "a clear victory." Understanding why requires understanding what it actually accomplished.

THE SETTING OUT: In Dhul-Qa'dah 6 AH — a sacred month — the Prophet ﷺ set out from Madinah with approximately 1,400 companions to perform 'Umrah. He brought sacrificial animals, put on ihram, and made clear through every means that this was a peaceful religious mission. Quraysh blocked him before he reached Makkah.

THE CAMEL STOPS: At Hudaybiyyah, the Prophet's ﷺ camel Qaswa knelt and refused to move. He said: "She has not become stubborn — she is being held by He who held the elephant from Makkah." He camped there.

THE PLEDGE OF RIDWAN: A rumour spread that the Prophet's ﷺ envoy Uthman had been killed. The Prophet ﷺ sat under a tree and took a pledge from the companions — the Pledge of Ridwan — to fight to the death if Uthman had been killed. They pledged on his hand. The Quran says: "Allah was pleased with the believers when they pledged to you under the tree." It was this total unity that forced Quraysh to negotiate seriously.

THE TERMS — APPARENTLY HUMILIATING:
1. No entry to Makkah this year — return next year for three days only
2. Any Qurayshi who comes to Muhammad ﷺ without his guardian's permission will be returned — but Muslims who go to Quraysh will not be returned
3. A ten-year truce

Umar (RA) was furious. He went to Abu Bakr: "Is he not the Prophet of Allah?" "Yes." "Are we not Muslims?" "Yes." "Then why are we accepting this humiliation?" Abu Bakr said: "Hold onto his stirrup. Follow him. I testify he is the Messenger of Allah."

WHY IT WAS ACTUALLY A VICTORY:
The ten-year peace gave Islam two years of uninterrupted dawah. In those two years, more people accepted Islam than in all the previous eighteen years combined. Khalid ibn al-Walid and Amr ibn al-As — both men who had fought against Islam — accepted Islam during this period.

The Prophet ﷺ used the peace immediately — writing letters to the heads of every major state: Heraclius (Byzantine Emperor), Khosrow (Persian Emperor), the Negus, the Mukawqis of Egypt. Islam was now addressing the world, not just Arabia.

Allah called Hudaybiyyah "a clear victory" (fath mubin) in Surah Al-Fath (48:1). The companions asked: "Is this a victory?" He said: "Yes — it is the greatest victory." And so it proved.`,
  },
  {
    episode: 31,
    title: `The Conquest of Makkah — Return to the Sacred City`,
    titleAr: `فتح مكة — العودة إلى البلد الحرام`,
    year: `8 AH / 630 CE`,
    content: `The conquest of Makkah is one of the most remarkable military and political events in human history: a nearly bloodless conquest of the city that had expelled, persecuted, and plotted against the Prophet ﷺ for twenty years.

THE PRETEXT: Quraysh violated the Treaty of Hudaybiyyah by supporting their allies Banu Bakr in attacking the Khuza'ah tribe, who were allied with the Muslims. Abu Sufyan rushed urgently to Madinah to renew the treaty — going to his daughter Umm Habibah (the Prophet's wife), to Abu Bakr, to Umar, to Ali. All refused to intercede. He went to the Prophet ﷺ directly — who did not respond. Abu Sufyan returned to Makkah empty-handed.

THE MARCH: The Prophet ﷺ mobilised with extraordinary secrecy — informing no one of the destination. The army grew to 10,000 men. He ordered each man to light a fire. Ten thousand fires lit the hills around Makkah.

Abu Sufyan came out to investigate, was captured, and brought before the Prophet ﷺ. His uncle Abbas intervened: "He is a man who loves pride — he needs an honourable exit." The Prophet ﷺ said: "Whoever enters Abu Sufyan's house is safe. Whoever closes his door is safe. Whoever enters the Sacred Mosque is safe." Abu Sufyan accepted Islam.

THE ENTRY: The Prophet ﷺ entered Makkah from the Adhakhir pass, lowering his head in humility on his camel until his head nearly touched the saddle — he who had been expelled was re-entering in triumph, bowing to Allah, not triumphant in himself.

THE KA'BAH: The Prophet ﷺ made tawaf, then approached the Ka'bah's door and recited: "The Truth has come, and falsehood has departed. Indeed, falsehood is ever bound to depart." (17:81). He pointed his staff at each of the 360 idols — each one toppled and fell. He entered the Ka'bah, ordered everything removed, then commanded Bilal to ascend to the roof and call the adhan. Bilal — who had said "Ahad, Ahad" under torture in this very city — now called the adhan over Makkah from the roof of the Ka'bah.

THE GENERAL AMNESTY: The Prophet ﷺ stood at the Ka'bah door and addressed the Makkans — people who had persecuted, tortured, and killed his followers for years. He said: "O Quraysh, what do you think I will do to you?" They said: "Goodness. You are a noble brother." He said: "Go — you are free (al-tulaqa')."

General amnesty. All forgiven. No retribution. The city that had done everything to extinguish this message had it extended to them — in the form of the very message they had tried to destroy. Within weeks, virtually the entire population of Makkah had entered Islam.`,
  },
  {
    episode: 32,
    title: `The Farewell Pilgrimage — The Prophet's ﷺ Last Hajj`,
    titleAr: `حجة الوداع — آخر حج للنبي ﷺ`,
    year: `10 AH / 632 CE`,
    content: `In the tenth year of Hijra, the Prophet ﷺ performed the only complete Hajj of his life — the Hajj al-Wada' (the Farewell Pilgrimage). What he said and did during those days remains the living guide for every Muslim's Hajj until the end of time.

THE GATHERING: Between 90,000 and 124,000 companions performed Hajj with him — the largest gathering of Muslims in history to that point. They came from every direction — the first Hajj in which the Ka'bah was completely purified of idol worship.

THE FAREWELL SERMON AT ARAFAH: On the 9th of Dhul-Hijjah, standing at the plain of Arafat on his camel surrounded by over 100,000 pilgrims, the Prophet ﷺ delivered what is perhaps the most important speech in human history:

"O people, listen to my words — for I do not know if I will meet you after this year in this place again."

"O people, your blood and your wealth are sacred to one another like the sanctity of this day, in this month, in this city."

"All usury (riba) from the time of Ignorance is abolished."

"All blood feuds from the time of Ignorance are abolished. The first blood feud I abolish is that of my own family" — he led by personal example.

"O people, your Lord is One, your father is one. There is no superiority of an Arab over a non-Arab, nor a non-Arab over an Arab, nor a white over a black, nor a black over a white — except through taqwa."

"O people, I am leaving among you that which if you hold to it you will never go astray — the Book of Allah."

At the end: "Have I conveyed?" They answered: "Yes." "Then let the one who is present convey to the one who is absent."

THE LAST REVELATION: On that day at Arafat, the final verse of the Quran descended: "This day I have perfected for you your religion, completed My favour upon you, and have approved for you Islam as religion." (5:3).

When Umar (RA) heard this verse, he wept. Someone asked why — isn't this a day of joy? He said: "Perfection comes only at an end — the religion is complete, which means the Prophet's ﷺ mission is complete. His death is near."

He completed every ritual of Hajj and gave his instruction for all time: "Take from me your Hajj rituals." Then he returned to Madinah. He had preached. He had delivered. He had transmitted. His task was complete.`,
  },
  {
    episode: 33,
    title: `The Final Illness — The Prophet ﷺ Prepares to Depart`,
    titleAr: `المرض الأخير — النبي ﷺ يستعد للرحيل`,
    year: `11 AH / 632 CE`,
    content: `The Prophet Muhammad ﷺ returned from the Farewell Pilgrimage and within approximately two months, fell ill with the illness that would take him from this world. He was sixty-three years old.

THE BEGINNING: The illness began with a severe headache and high fever — so intense that when companions placed their hands on him from under the covers, they could feel the heat through the blanket. He would say: "I am afflicted more severely than two of you combined." He said: "The prophets are tested most severely — then those nearest to them, then those nearest to them."

Despite his illness, the Prophet ﷺ led prayers as long as he physically could — leaning on two companions with his feet dragging on the ground. When he could no longer attend, he commanded Abu Bakr to lead the prayers. Abu Bakr led every prayer. Once the Prophet ﷺ felt a brief lightening and was helped to the mosque — he found Abu Bakr leading, sat beside him, and Abu Bakr continued while taking the takbeer from the Prophet's ﷺ still-strong voice.

HIS FINAL PUBLIC ADDRESS: He came to the mosque one last time and said: "O people, a fire has been kindled and tribulations are coming like portions of a dark night. By Allah, you cannot hold anything against me — I have made lawful nothing except what Allah made lawful, and made unlawful nothing except what Allah made unlawful."

He then said: "Allah has given one of His servants the choice between the world and what is with Allah, and he chose what is with Allah." Abu Bakr wept — he knew with the discernment of love that the Prophet ﷺ was speaking of himself.

IN 'AISHAH'S ROOM: He had requested to be nursed in 'Aishah's room, and the wives agreed. He lay there, dipping his hand in water and passing it over his face, saying: "La ilaha illallah — death has its agonies." He distributed what little he had — seven or eight dinars — insisting they be given in charity: "What would Muhammad think of his Lord if he met Him while he still had these?"

He said: "Do not take my grave as a place of worship — I forbid this strongly."

He said: "No prophet has died except in the place he most loved to be buried — so bury me here." He indicated the spot in 'Aishah's room beneath which he now rests.`,
  },
  {
    episode: 34,
    title: `The Death of the Prophet ﷺ and What Followed`,
    titleAr: `وفاة النبي ﷺ وما تبعها`,
    year: `12 Rabi' al-Awwal, 11 AH`,
    content: `'Aishah (RA) described his last moments. He was lying with his head against her chest. A vessel of water was near. He kept dipping his hand in it and wiping his face, saying: "La ilaha illallah — death has its agonies." Then he raised his finger and his lips moved. She bent to hear. His last words were: "Rather, the Highest Companion (al-Rafiq al-A'la)." The choice between remaining in this world and meeting his Lord — and he chose his Lord. His hand went limp. The finger he had raised came to rest. He returned to the mercy of Allah.

'Aishah screamed. The news spread to the mosque. Umar ibn al-Khattab (RA) — the strongest of the companions — stood and said: "Whoever says Muhammad has died, I will strike him with my sword. He has only gone to his Lord as Musa went, and he will return!" He was in denial — the man who had ordered him was gone.

Abu Bakr entered 'Aishah's room. He lifted the cloth from the Prophet's face, kissed his forehead, and said: "How sweet you are in life and how sweet in death, O you whom I love, O Prophet of Allah." He replaced the cloth, went out to the mosque. He said to Umar: "Sit down." Umar would not. He addressed the people:

"Whoever worshipped Muhammad — Muhammad is dead. Whoever worshipped Allah — Allah is Living and never dies." Then he recited: "Muhammad is not but a messenger. Messengers have passed on before him. So if he dies or is killed, will you turn back on your heels?" (3:144).

Umar said: "By Allah, it was as if I had never heard that verse before." His legs gave way and he sat down. Every companion present sat down. The verse carried them when their hearts could not carry themselves.

THE BURIAL: The Prophet ﷺ was washed, wrapped in three white Yemeni garments, and buried in 'Aishah's room — the place he had indicated — on the Tuesday following his death on Monday the 12th of Rabi' al-Awwal, 11 AH.

He left behind: the Quran, the Sunnah, the community of Muslims, and a transformation of the world whose effects continue to this day.

He came with a message for all of humanity. He was what he said he was. And the best evidence is what we now know — fourteen centuries of human history shaped by his words, his life, and his example. May Allah's peace and blessings be upon him, his family, and his companions, until the Day of Judgement.`,
  },
  {
    episode: 35,
    title: `The Character of the Prophet ﷺ — A Portrait`,
    titleAr: `شمائل النبي ﷺ — صورة كاملة`,
    year: `Lifetime`,
    content: `The Prophet Muhammad ﷺ was not merely a carrier of a message — he was himself the living embodiment of it. 'Aishah (RA), when asked about his character, said: "His character was the Quran."

PHYSICAL APPEARANCE: Medium height — neither tall nor short. White with a rosy tint, described as "luminous." His hair was black, between curly and straight, reaching to his earlobes or shoulders. Large dark eyes with naturally kohl-like rims and long lashes. Broad forehead, prominent brows, wide mouth with white teeth. Dense beard. He walked with a forward lean as if descending a slope — swift, purposeful. Those beside him had to take quick steps to keep up. His sweat smelled better than any perfume. If he shook someone's hand, the scent remained for the rest of the day. If he passed through a road, people knew by the fragrance he left.

Between his shoulder blades was the Seal of Prophethood — a raised reddish mark approximately the size of a pigeon's egg. He smiled often — his smile illuminated. He never laughed loudly — his laughter was a smile that showed his teeth.

HIS GENTLENESS: Anas ibn Malik (RA) served him for ten years and said: "He never once said 'uff' (a word of mild displeasure). He never said about something I did: 'Why did you do this?' He never said about something I didn't do: 'Why didn't you?'"

A bedouin urinated in a corner of the mosque. The companions moved to stop him. The Prophet ﷺ said: "Leave him." When the man finished, the Prophet ﷺ gently explained: "This mosque is for the remembrance of Allah — not appropriate for urine." He asked for water to be poured on the spot. The man became Muslim, saying: "I have never met a teacher more gentle than this man."

HIS GENEROSITY: He was never asked for something and said no. A man came asking and the Prophet ﷺ had nothing — he borrowed in order to give. Once, a man came and he gave him a flock of sheep between two mountains. The man returned to his people and said: "Embrace Islam — Muhammad gives like a man who does not fear poverty."

HIS JUSTICE: When some companions tried to intercede for a noble Qurayshi woman who had stolen, seeking to spare her the legal punishment, the Prophet ﷺ addressed everyone: "What destroyed those before you was that when a noble person stole, they left him alone, and when a weak person stole, they applied the punishment. By Allah, if Fatimah the daughter of Muhammad stole, I would cut off her hand."

HIS WORSHIP: He stood in night prayer until his feet were swollen. 'Aishah asked: why do you do this when Allah has forgiven you all past and future sin? He said: "Should I not be a grateful servant?"

HIS LOVE FOR HIS UMMAH: He said: "I wished I could see my brothers." His companions asked: "Are we not your brothers?" He said: "You are my companions. My brothers are those who come after me and believe in me without having seen me."

This is who he was. "And indeed, you are of a great moral character." (68:4). To know him is to encounter the clearest demonstration in human experience of what a human being can be when they surrender completely to Allah.`,
  },
  {
    episode: 36,
    title: `Umar ibn al-Khattab Accepts Islam`,
    titleAr: `إسلام عمر بن الخطاب رضي الله عنه`,
    year: `616 CE / 6th year of prophethood`,
    content: `The conversion of Umar ibn al-Khattab (RA) was one of the most dramatic and consequential events of the early Makkan period. He had been among the most fierce enemies of Islam — physically strong, socially powerful, ruthless in his opposition. His conversion transformed the Muslim community from a persecuted minority into a group that could walk through Makkah openly for the first time.

The story of his conversion comes in two versions from the hadith literature, and both may describe the same night from different angles.

THE NIGHT OF THE DECISION: Umar set out one night — by his own admission intending to kill the Prophet ﷺ, believing this would end the problem that was fracturing Quraysh. A man from the Banu Makhzum met him and asked where he was going. When Umar told him, the man said: "Before you do anything, go deal with your own household — your sister Fatimah and her husband Sa'd ibn Zayd have both accepted Muhammad's religion."

Umar changed direction and went to his sister's house. As he approached, he could hear recitation inside. He knocked. They hid what they were reading. He demanded to know what he had heard. A confrontation erupted — he struck his brother-in-law Sa'd, then when his sister Fatimah intervened, he struck her too, drawing blood from her face.

When he saw the blood on his sister's face — his own sister, whom he had just struck — something cracked inside him. She said, bleeding but unbowed: "O Umar, do whatever you will — Islam has entered our hearts and nothing will remove it." He asked to see what they had been reading.

They gave him the pages — the opening of Surah Ta-Ha. He read: "Ta Ha — We have not sent down the Quran to you to cause you distress, but only as a reminder for those who fear. A revelation from He who created the earth and the highest heavens." He kept reading. He read: "Indeed, I am Allah. There is no god except Me, so worship Me and establish prayer for My remembrance."

The man who had come to commit murder sat down and the Quran entered him. He said: "How beautiful and noble are these words. Take me to Muhammad."

GOING TO THE PROPHET ﷺ: The companions were at Dar al-Arqam. When news came that Umar was at the door, there was fear — some were afraid it was a trap. Hamzah said: "Let him in. If he has come with good intentions, we will support him. If he has come with evil intentions, we will kill him with his own sword." 

The Prophet ﷺ himself came to the door, took Umar by his garment, and said: "What has brought you here, O son of Khattab? By Allah, I think you will not desist until Allah brings calamity down upon you." Umar said: "O Messenger of Allah, I have come to believe in Allah and His Messenger and in what he brought from Allah." The Prophet ﷺ said "Allahu Akbar!" so loudly that every person in Dar al-Arqam heard it.

THE IMMEDIATE IMPACT: Umar had a condition before accepting Islam. He said: "O Messenger of Allah, are we not on the truth whether we die or live?" "Yes." "Then why do we hide? By He who sent you with the truth, I will not leave any gathering I attended as a disbeliever without attending it as a Muslim."

He went to Abu Jahl's house — his maternal uncle — and announced his Islam. Abu Jahl slammed the door in his face. He went to every gathering in Makkah and announced it. He walked through the city openly Muslim. He marched to the Ka'bah with the Muslims in two rows — Hamzah leading one, Umar leading the other — and they prayed openly for the first time.

The Prophet ﷺ gave Umar the title by which history would know him: Al-Faruq — He who distinguishes between truth and falsehood. He said: "Islam was concealed. By Allah, when Umar accepted Islam, it was not concealed — we prayed openly at the Ka'bah." The difference between a community that hides and a community that stands in the open — that was the difference Umar's conversion made.`,
  },
  {
    episode: 37,
    title: `Quraysh's Offers and the Prophet's ﷺ Refusal`,
    titleAr: `عروض قريش على النبي ﷺ ورفضه`,
    year: `614–619 CE`,
    content: `Throughout the Makkan period, the Quraysh leadership made multiple attempts to negotiate with the Prophet ﷺ — not because they were sincere in seeking truth, but because they wanted the problem to go away without the political cost of open war against Banu Hashim. These negotiations reveal both the desperation of the Quraysh leadership and the absolute clarity of the Prophet's ﷺ mission.

THE OFFER OF WEALTH AND KINGSHIP: A delegation of Quraysh's most powerful men — including Utbah ibn Rabi'ah, Walid ibn Mughirah, and others — met the Prophet ﷺ. Utbah, considered the most eloquent among them, spoke: "O nephew, you have brought a serious matter upon your people. Listen to us — we offer you several things and perhaps one of them will satisfy you. If you seek wealth through this affair, we will collect money for you until you are the wealthiest man among us. If you seek honour and chieftainship, we will make you our chief and no matter will be decided without you. If you seek kingship, we will make you our king. If what appears to you is a jinn you cannot repel — we will seek medicine for you and spend our wealth curing you."

The Prophet ﷺ listened to all of this in complete silence. Then he said: "Have you finished?" Utbah said: "Yes." The Prophet ﷺ said: "Then listen." And he recited the opening of Surah Fussilat — the Quran, not his own words, beginning: "Ha Meem. A revelation from the Most Gracious, the Most Merciful. A Book whose verses have been detailed, an Arabic Quran for a people who know..." He continued reciting through the verse of prostration, and then prostrated.

Utbah returned to Quraysh changed. They asked what had happened. He said: "By Allah, I heard from him something the like of which I have never heard before. By Allah, it is not poetry, it is not magic, it is not divination. O Quraysh — leave this man to his affair. By Allah, what he has will have consequences. If the Arabs deal with him — you will be freed from him by others. And if he prevails over the Arabs — his kingship is your kingship and his honour is your honour." They said: "He has bewitched you with his tongue."

THE OFFER OF COMPROMISE — SURAH AL-KAFIRUN: Another approach — perhaps the most insidious — was the theological compromise. Some Qurayshi leaders proposed: let us agree to worship each other's gods. For one year you worship Lat and Uzza, and for one year we will worship your God. This seemed to them like a reasonable accommodation.

Allah's response was one of the shortest and most decisive surahs in the Quran: "Say: O disbelievers — I do not worship what you worship. Nor are you worshippers of what I worship. Nor will I be a worshipper of what you worship. Nor will you be worshippers of what I worship. For you is your religion, and for me is my religion." (Surah Al-Kafirun, 109). No negotiation. No accommodation. Complete, courteous, absolute separation.

THE STATEMENT THAT ENDED ALL NEGOTIATION: The most famous moment came when Abu Talib — pressured by Quraysh to hand over his nephew — relayed their ultimatum to the Prophet ﷺ. The Quraysh told Abu Talib: either hand him over or we will treat the entire Banu Hashim as enemies. Abu Talib was moved. He went to his nephew and told him of the situation and suggested, gently, that perhaps he should consider his uncle's position and the clan's safety.

The Prophet ﷺ wept. Then he said: "O uncle, by Allah — if they were to place the sun in my right hand and the moon in my left hand in return for my abandoning this matter — until Allah makes it triumph or I die in its pursuit — I would not abandon it."

Abu Talib looked at his nephew for a long moment, then said: "Go, my nephew, and say whatever you wish. By Allah, I will never hand you over to them for anything."

No wealth. No kingship. No compromise. No retreat. This was the foundation upon which everything that came after was built.`,
  },
  {
    episode: 38,
    title: `The Conversion of Hamzah ibn Abd al-Muttalib`,
    titleAr: `إسلام حمزة بن عبد المطلب رضي الله عنه`,
    year: `615 CE`,
    content: `The conversion of Hamzah ibn Abd al-Muttalib — the Prophet's ﷺ uncle, a man of extraordinary physical strength and social standing — was one of the most important events of the early Makkan period. It came not from gradual intellectual persuasion but from a moment of tribal honour transformed into something greater.

Hamzah was one of the most feared warriors in Arabia. He was the Prophet's ﷺ uncle, approximately the same age, and the two had grown up almost as brothers. He was known throughout Arabia for his strength, his hunting skill, and his personal courage. He had not yet accepted Islam — he was, in the early period, a man of Jahiliyyah values living among the Muslims, watching but not yet committed.

THE INCIDENT THAT CHANGED EVERYTHING: One day, Abu Jahl encountered the Prophet ﷺ near the mountain of Safa and subjected him to a severe verbal assault — mocking him, insulting him, attacking his message with abuse and contempt. The Prophet ﷺ remained silent throughout. A woman — a freed slave woman from Abdullah ibn Jud'an's household — witnessed the entire incident from her doorway.

When Hamzah returned from his hunting that evening, passing by her door with his bow over his shoulder, the woman said: "O Abu Umarah — if only you had seen what Abu al-Hakam (Abu Jahl) did to your nephew Muhammad today. He found him sitting and abused him and said terrible things to him, and Muhammad did not speak a word to him."

Something ignited in Hamzah. He turned and walked directly to the mosque where Abu Jahl was sitting among a group of Quraysh. Hamzah walked up to Abu Jahl and struck him on the head with his bow — hard enough to wound him. Then he said: "Will you insult him while I am on his religion and I say what he says? Strike me back if you can." Abu Jahl's companions started to rise. Abu Jahl, blood running from his wound, held them back: "Leave Abu Umarah — I did say terrible things to his nephew."

Hamzah walked away. He had acted from tribal honour — defending his nephew's dignity. But as he walked, he began to think. Had he truly meant what he said — that he was on Muhammad's ﷺ religion? Was it just words of anger? He spent the night wrestling with this question.

By morning, he had his answer. He went to the Prophet ﷺ and said: "O nephew, confirm to me what your religion is." The Prophet ﷺ described Islam to him. Hamzah accepted — fully, completely, with conviction. He was Muslim.

THE IMPACT: Hamzah's conversion had an immediate practical effect on the safety of the Prophet ﷺ and the early Muslim community. He was feared by every man in Makkah. His tribal protection was formidable. Combined with Umar's conversion shortly after, the Muslims had two of the most physically imposing and socially powerful men in Quraysh openly declaring Islam.

Ibn Masud (RA) said: "We were strengthened with the conversion of Umar" — and the same was said of Hamzah.

Hamzah became known as Asad Allah — the Lion of Allah — and Asad Rasul Allah — the Lion of the Messenger of Allah. He would fight at Badr with a distinction that became legendary, killing multiple Qurayshi leaders. He would die at Uhud as the greatest martyr of that battle, his body mutilated by Hind bint Utbah who had hired Wahshi specifically to kill him in revenge for her father's death at Badr.

The Prophet ﷺ called him "the master of martyrs" (sayyid al-shuhada'). When he saw his mutilated body at Uhud, he wept with a grief that those present said they had never seen him express before or after.`,
  },
  {
    episode: 39,
    title: `The Individual Expeditions Before Badr — The Saraya`,
    titleAr: `السرايا قبل بدر — الاستطلاع والمواجهة الأولى`,
    year: `1–2 AH / 622–624 CE`,
    content: `Between the Hijra to Madinah and the Battle of Badr, the Prophet ﷺ sent out a series of military expeditions — some he led personally (ghazawat) and some he sent under other commanders (saraya). These expeditions are often overlooked in popular Seerah accounts but are crucial to understanding how the Islamic state developed its military capacity and strategic thinking.

THE PURPOSE OF THE EARLY EXPEDITIONS: These were not random raids. They served several strategic purposes simultaneously:
1. Intercepting Qurayshi trade caravans — disrupting the economic lifeblood of the community that had persecuted and expelled the Muslims and seized their property
2. Establishing treaties with tribes along key trade routes — building the political network that would eventually enable the Hijaz to submit to Islam
3. Training the Muslim fighters in coordinated military action before the larger confrontations
4. Demonstrating to the tribes of Arabia that the Muslims could project force and were not merely a refugee community

THE EXPEDITION OF HAMZAH (1 AH): The first military expedition sent by the Prophet ﷺ was under Hamzah ibn Abd al-Muttalib, with thirty riders, to intercept a Qurayshi caravan near the coast at Is. They encountered Abu Jahl leading 300 men. A confrontation nearly erupted. Majdi ibn Amr al-Juhani — who had treaties with both sides — intervened and separated the two groups. No fighting took place, but the message was sent: the Muslims would contest the trade routes.

THE EXPEDITION OF UBAYDA IBN AL-HARITH: Sixty riders sent to the valley of Rabigh encountered a large Qurayshi force. The first arrow ever shot in the path of Islam was shot here — by Sa'd ibn Abi Waqqas (RA), who later said: "I shot my arrow and by Allah, I don't know where it landed, but I was the first person to shoot an arrow in the path of Allah." Again, no major battle resulted, but the lines were being drawn.

EXPEDITION OF NAKHLA — THE FIRST BLOOD: This was the first incident in which blood was shed. The Prophet ﷺ sent eight men under Abdullah ibn Jahsh with sealed orders — he was told not to open them until two days' travel from Madinah. When he opened them, the orders said: proceed to Nakhla (between Makkah and Ta'if) and observe what Quraysh are doing, but do not compel any of your men.

At Nakhla they encountered a small Qurayshi trade caravan in the last day of Rajab — one of the sacred months in which fighting was traditionally prohibited. After deliberation — and uncertainty — they attacked. One Qurayshi was killed (Amr ibn al-Hadrami), two were captured, and the caravan was taken.

When they returned to Madinah, the Prophet ﷺ was initially displeased — had they fought in a sacred month? He held the caravan and the prisoners without judgment. The Quraysh made much of this: "Muhammad has violated the sacred months." Allah then revealed: "They ask you about the sacred month — about fighting therein. Say: fighting therein is great sin. But averting people from the way of Allah and disbelief in Him and the Sacred Mosque and the expulsion of its people therefrom is greater evil in the sight of Allah." (2:217)

The verse put what had happened in context: the Quraysh had expelled the Muslims from Makkah, had prevented them from the Sacred Mosque, had tortured and killed them — for years. One man dying in a caravan raid was a small thing beside what Quraysh had done systematically.

THE STRATEGIC CONTEXT OF BADR: By the time Badr came, these earlier expeditions had served their purpose. The Muslim fighters had experience. The trade routes had been contested repeatedly. The tribes along the routes had been approached for treaties. And the Quraysh knew that their summer caravan under Abu Sufyan — the largest of the year — was at risk. This is why Abu Sufyan sent for help, and why Quraysh responded with such a massive force. Badr was the culmination of eighteen months of strategic pressure.`,
  },
  {
    episode: 40,
    title: `The Hypocrites of Madinah — Abdullah ibn Ubayy`,
    titleAr: `المنافقون في المدينة — عبد الله بن أبي`,
    year: `2–9 AH`,
    content: `One of the most significant and underappreciated dimensions of the Madinan period is the presence and management of the Munafiqun — the Hypocrites — a group who outwardly declared Islam but inwardly opposed it. Understanding this dimension is essential to understanding many of the events of the Seerah that otherwise seem puzzling.

THE ORIGIN OF NIFAQ IN MADINAH: Before the Prophet ﷺ arrived in Madinah, the Khazraj tribe had been on the verge of crowning Abdullah ibn Ubayy ibn Salul as their king. The preparations were nearly complete — a crown was being made for him. Then Islam arrived. The Aws and Khazraj embraced Islam. The political calculation shifted entirely. Abdullah ibn Ubayy found himself deprived of the kingship he was about to receive — and the man who arrived from Makkah had taken the authority he had expected.

He accepted Islam outwardly — he had no choice; the social reality had shifted. But his heart was never in it. He became the leader of the Munafiqun — those who said "we believe" with their tongues while their hearts rejected the truth. The Quran devotes an entire Surah to this group (Al-Munafiqun, 63) and addresses them extensively throughout Surah Al-Baqarah, Al-Nisa, and Al-Ahzab.

HOW THE MUNAFIQUN OPERATED: They attended the mosque, performed prayer, gave zakat outwardly — and then in private mocked the Muslims, spread discord, undermined military morale, and engaged in strategic sabotage at critical moments. Allah described them precisely: "And when they meet those who believe, they say 'We believe.' But when they are alone with their evil ones, they say 'Indeed, we are with you — we were only mockers.'" (2:14)

KEY INCIDENTS INVOLVING ABDULLAH IBN UBAYY:

AT UHUD: When the Muslim army set out toward Uhud, Abdullah ibn Ubayy marched out with approximately 300 men — roughly a third of the force. Then, before the battle, he withdrew all 300, saying: "Why should we kill ourselves when Muhammad listened to children and did not follow my advice?" His withdrawal critically weakened the Muslim army before it even reached the battlefield.

THE SLANDER OF 'AISHAH (AL-IFK): In the 5th year of Hijra, after a military expedition, a rumour was spread that 'Aishah (RA) — who had been separated from the army — had been unfaithful. The source and main propagator of this slander was Abdullah ibn Ubayy. The Prophet ﷺ was devastated. 'Aishah was devastated. The community was split for a month. Then Allah revealed Surah An-Nur, specifically exonerating 'Aishah (RA): "Those who brought the slander are a group among you. Do not think it is evil for you — rather it is good for you." The men who had spread the rumour received the Islamic legal punishment (80 lashes for slander without proof). Abdullah ibn Ubayy — too politically protected to punish directly at that moment — was dealt with by revelation.

THE INCIDENT AT BANU AL-MUSTALIQ: After the battle of Banu al-Mustaliq, a dispute broke out between an Ansari and a Muhajir. Abdullah ibn Ubayy seized on this and said: "When we return to Madinah, the more honourable will drive out the lowly" — meaning himself and the Ansar would drive out the Prophet ﷺ and the Muhajirin. This reached the Prophet ﷺ. His son Abdullah ibn Abdullah ibn Ubayy — a sincere Muslim — came to the Prophet ﷺ and asked permission to kill his own father if necessary. The Prophet ﷺ said no — "we will treat him well as long as he is with us."

THE QURAN'S VERDICT: Allah revealed Surah Al-Munafiqun specifically about Abdullah ibn Ubayy: "When the hypocrites come to you, they say 'We testify that you are indeed the Messenger of Allah.' And Allah knows that you are His Messenger, and Allah testifies that the hypocrites are liars." (63:1)

When Abdullah ibn Ubayy died, his son asked the Prophet ﷺ to pray over him. The Prophet ﷺ stood to do so. Umar ibn al-Khattab pulled at his garment: "O Messenger of Allah, are you going to pray over this man when Allah has prohibited you from doing so?" The Prophet ﷺ smiled and said: "Let me be, Umar." He prayed over him. Then Allah revealed: "And do not pray over any of them who has died, ever, and do not stand at his grave." (9:84) The Prophet ﷺ never again prayed the funeral prayer for a hypocrite.

The management of the Munafiqun — knowing who they were, what they were doing, yet maintaining social peace while Allah exposed them gradually through revelation — was one of the greatest tests of prophetic leadership in the Madinan period.`,
  },
  {
    episode: 41,
    title: `The Marriages of the Prophet ﷺ — Wisdom and Purpose`,
    titleAr: `زيجات النبي ﷺ — الحكمة والغاية`,
    year: `1–7 AH`,
    content: `The Prophet ﷺ married thirteen women in his lifetime — eleven of whom he was married to simultaneously at one point. This is one of the most frequently misunderstood aspects of the Seerah, and understanding it correctly requires understanding the context, the purpose, and the character of the man involved.

The first and most important fact: for twenty-five years, from the age of twenty-five until the age of fifty, the Prophet ﷺ was married to only one woman — Khadijah (RA). In a society where multiple wives was the norm, the symbol of status, and the expectation of powerful men, he chose monogamy for twenty-five years. This is the starting context for everything else.

AFTER KHADIJAH'S DEATH: His marriages after her death — all contracted in Madinah after the age of fifty — served distinct purposes that can be categorised clearly:

SAWDAH BINT ZAM'AH: Married immediately after Khadijah's death. A Muslim widow of advanced age whose husband had died returning from Abyssinia, leaving her alone with no protector. This marriage was pure compassion — providing shelter and dignity to a vulnerable woman.

'AISHAH BINT ABI BAKR: The only virgin he married. Her marriage was contracted in Makkah and consummated in Madinah after puberty. Its purpose was to cement the relationship with Abu Bakr — his closest companion and successor — and to bring into his household the woman who would become the greatest female scholar of Islam, transmitting one-third of Islamic jurisprudence.

HAFSA BINT UMAR: Widowed after her husband died of wounds from Badr. Her father Umar (RA) had offered her to Abu Bakr and Uthman, both of whom declined (knowing the Prophet ﷺ would marry her). This marriage honoured Umar and maintained the close family bonds between the Prophet ﷺ and his two most important companions.

UMM SALAMAH (HIND BINT ABI UMAYYAH): One of the most senior and respected Muslim women — she had made the first Hijra to Abyssinia with her husband Abu Salamah, then the second Hijra to Madinah. When Abu Salamah died from wounds received at Uhud, she was left a widow with children. Abu Bakr proposed to her. She declined. Umar proposed. She declined. When the Prophet ﷺ proposed, she listed her concerns: "I am a woman of jealous nature. I am old. I have children. And there is no guardian available." He addressed each concern: her jealousy Allah would remove, her age was not a problem as he was older, her children would be cared for. She accepted.

ZAYNAB BINT JAHSH: Her marriage is the most extensively discussed in the Quran itself. She was the Prophet's ﷺ cousin, married to his freed slave and adopted son Zayd ibn Harithah. The marriage had problems — they were incompatible — and Zayd came to the Prophet ﷺ repeatedly wanting to divorce her. Each time the Prophet ﷺ said: "Keep your wife and fear Allah." The Prophet ﷺ knew from revelation that he would eventually marry Zaynab — and he was apprehensive about what people would say. Allah revealed: "And you feared the people while Allah has more right that you should fear Him." (33:37). When Zayd divorced her, Allah commanded the Prophet ﷺ to marry her — specifically to establish the ruling that adopted sons are not like biological sons and their divorced wives can be married. "So that there would not be upon the believers any discomfort concerning the wives of their adopted sons." (33:37)

JUWAYRIYAH BINT AL-HARITH: Daughter of the chief of Banu al-Mustaliq, she was taken as a captive after the battle against her tribe. She came to the Prophet ﷺ seeking help to pay her ransom. He offered instead to pay her ransom and marry her. She accepted and became Muslim. The effect was immediate: the companions, out of respect for their new relationship to the Prophet ﷺ through Juwayriyah, freed every captive from Banu al-Mustaliq. Her entire tribe entered Islam. The Prophet ﷺ later said: "I know no woman who brought more blessing to her people than Juwayriyah."

UMM HABIBAH (RAMLAH BINT ABI SUFYAN): Daughter of Abu Sufyan — the leader of Quraysh and the Prophet's ﷺ greatest enemy at that time. She had migrated to Abyssinia with her husband, who then apostasized and became Christian. She remained steadfast as a Muslim, widowed, far from family, alone in Abyssinia. The Prophet ﷺ sent a proposal through the Negus. The Negus paid her mahr of 400 dinars himself as an act of honour. This marriage turned Abu Sufyan — still a polytheist — into the father-in-law of the Prophet ﷺ, a relationship that softened his hostility at critical moments.

SAFIYYAH BINT HUYAYY: Daughter of the chief of Banu al-Nadir — a Jewish tribe. She was taken captive at Khaybar. The Prophet ﷺ freed her and offered her the choice: return to her people or accept Islam and marry him. She accepted Islam and marriage. This marriage sent a clear political message about the integration of former enemies into the Muslim community through dignity and choice.

MAYMUNAH BINT AL-HARITH: His last marriage. She was the sister-in-law of his uncle Abbas, contracted during the 'Umrah al-Qada (the compensatory Umrah a year after Hudaybiyyah). She was widowed and had asked to be married to the Prophet ﷺ. This marriage also sealed political alliances with important Arabian tribes.

THE HOUSEHOLD: 'Aishah (RA) described the Prophet's ﷺ conduct with his wives as scrupulously fair — he would divide his days and nights between them equally, travel with whoever the lot fell upon, consult them, honour their opinions. He said: "The best of you is the best to his wives — and I am the best of you to my wives." His treatment of his wives was the standard he set for the Muslim community.`,
  },
  {
    episode: 42,
    title: `Banu Qaynuqa' and Banu al-Nadir — The Jewish Tribes' Violations`,
    titleAr: `بنو قينقاع وبنو النضير — نقض العهد`,
    year: `2–4 AH`,
    content: `The Madinah of the Prophet's ﷺ era contained three major Jewish tribes: Banu Qaynuqa', Banu al-Nadir, and Banu Qurayza. Each had entered into formal treaties with the Prophet ﷺ as part of the Constitution of Madinah. Each, in sequence, violated those treaties — and each faced the consequences. Their stories are a study in what international law looks like in an age without international courts: trust, violation, and consequence.

BANU QAYNUQA' — THE FIRST EXPULSION (2 AH): Banu Qaynuqa' were goldsmiths and metalworkers concentrated in the Qaynuqa' market in Madinah. They were known for their arrogance and had mocked the Muslim victory at Badr — they told the Prophet ﷺ: "Do not be deceived by your battle against Quraysh — they did not know how to fight. If you had fought us, you would know we are different men."

The incident that triggered the crisis began at their market. A Muslim woman came to buy jewellery. A goldsmith tied the back of her garment to something behind her without her knowing. When she stood up, her clothing pulled back and exposed her. She screamed. A Muslim man who saw what happened killed the goldsmith. The goldsmith's companions killed the Muslim man. The blood feud began.

The Prophet ﷺ besieged Banu Qaynuqa' in their fortifications for fifteen days. They surrendered. Abdullah ibn Ubayy (the hypocrite leader) interceded strongly for them — they were his allies. The Prophet ﷺ, under his pressure, changed the sentence from death to exile. Banu Qaynuqa' left Madinah for Syria, never to return.

BANU AL-NADIR — THE SECOND EXPULSION (4 AH): Banu al-Nadir was the wealthiest and most prestigious of the three Jewish tribes, living in fortified settlements south of Madinah with extensive date palm groves. Their violation was far more serious — an assassination plot against the Prophet ﷺ.

The Prophet ﷺ had come to Banu al-Nadir to request their help in paying the blood money for two men — as required by the Constitution of Madinah. While he sat against a wall of their houses, a man climbed to the roof intending to drop a boulder on him. Jibreel informed the Prophet ﷺ of the plot. He stood up calmly and returned to Madinah, sending word to Banu al-Nadir: you have twenty days to leave.

Banu al-Nadir began preparing to leave. Then Abdullah ibn Ubayy sent them a message: "Do not leave — I will support you with 2,000 men and the Qurayza and Ghatafan will support you." They believed him and stopped their preparations, sending defiance back to the Prophet ﷺ.

The promised support from Abdullah ibn Ubayy never came. The Prophet ﷺ besieged Banu al-Nadir. After approximately fifteen days, they surrendered unconditionally. They were permitted to take whatever their camels could carry from their wealth — except weapons. They loaded their camels so heavily that they took down their own house doors and loaded the timber. They left. Their date palm groves and remaining property became the property of the Islamic state — used for the Muhajirin who had not yet received shares of Ansari land.

THE QURAN'S COMMENTARY: Surah Al-Hashr (59) was revealed about the expulsion of Banu al-Nadir. It describes: "He it is who expelled those who disbelieved among the People of the Scripture from their homes at the first gathering. You did not think they would leave, and they thought that their fortresses would protect them from Allah — but Allah came at them from where they had not expected, and He cast terror into their hearts so they destroyed their own houses by their own hands and the hands of the believers." (59:2)

The verse then contains the most detailed treatment of the distribution of wartime gains in Islamic law — how the fay (property gained without fighting) is distributed among the categories of the needy. This is practical governance revealed through specific historical events.

What the stories of Banu Qaynuqa' and Banu al-Nadir demonstrate is the Prophet's ﷺ consistent application of treaty law: protection was given while treaties held, and consequences followed when treaties were violated — but always with measured, proportional response rather than collective punishment beyond what the violation warranted.`,
  },
  {
    episode: 43,
    title: `The Battle of Hunayn — Pride Before the Fall`,
    titleAr: `غزوة حنين — الغرور قبل الهزيمة`,
    year: `8 AH / 630 CE`,
    content: `Three weeks after the conquest of Makkah, the largest battle of the post-Makkah period occurred — Hunayn. It contained the same essential lesson as Uhud, delivered at ten times the scale: the danger of pride and the absolute dependence of the Muslim community on Allah, not on their numbers.

THE HAWAZIN COALITION: The Hawazin and Thaqif tribes saw the conquest of Makkah as threatening to encircle them. Their leader Malik ibn 'Awf al-Nasri made a reckless decision to attack first, assembling a large force and making the fateful error of bringing the families, children, and livestock of the tribesmen with the army — to give the fighters maximum motivation by ensuring no one could retreat safely.

The Prophet ﷺ marched from Makkah with 12,000 men — by far the largest Muslim army ever assembled. Some of the newly Muslim Makkans said with admiration: "We will not be defeated today because of our numbers." This was precisely the wrong thought.

THE AMBUSH AT DAWN: The valley of Hunayn was ideal for ambush. The Hawazin had filled every rocky point, every cleft, every elevated position on both sides of the valley with archers overnight. As the Muslim vanguard entered the valley before dawn, a devastating rain of arrows came from all sides simultaneously. The front ranks broke and fled — crashing back into those behind them, causing a cascade of panic through the entire force.

THE PROPHET ﷺ STANDS FIRM: Of the 12,000 men, fewer than a hundred remained around the Prophet ﷺ. He was on his white mule, and he did not move. His uncle Abbas — who had an enormously powerful voice — called out repeatedly: "O Ansarites! O companions of the Acacia tree! Come!" His voice echoed off the valley walls. The Ansar heard it. Men turned their camels in the chaos, turned their horses, men on foot turned and ran back. They called to each other: "Labbayk! Here we are!"

The Prophet ﷺ descended from his mule, took a handful of earth, and threw it toward the enemy saying: "May the faces be disfigured!" The Quran recorded this: "And you did not throw when you threw — but Allah threw." (8:17). The tide turned completely. The Hawazin were routed, leaving behind 6,000 prisoners, 24,000 camels, 40,000 sheep, and enormous quantities of silver.

THE LESSON OF NUMBERS: The Quran addressed the opening of Hunayn directly: "Allah has already given you victory in many regions and on the day of Hunayn, when your great number pleased you — but it did not avail you at all, and the earth was confining for you with all its vastness; then you turned back, fleeing." (9:25). Your numbers, your weapons, your recent conquest — none of it was the source of your success. Allah is. The moment that pride in numbers replaced tawakkul (reliance on Allah), the army collapsed.

THE DISTRIBUTION OF SPOILS: The Prophet ﷺ gave the newly converted leaders of Makkah (the Tulaqa') disproportionately large shares — up to 100 camels each — to bind their hearts to Islam. The Ansar received nothing. They were hurt. The Prophet ﷺ gathered them privately: "O Ansar — does it not please you that people go home with camels and sheep, while you go home with the Messenger of Allah?" They wept and said: "We are content, O Messenger of Allah." He said: "O Allah, have mercy on the Ansar and the children of the Ansar and the children of the children of the Ansar." Every man present wept until his beard was wet.

THE AFTERMATH AT TA'IF: The defeated Hawazin and Thaqif retreated into the fortress-city of Ta'if — the city that had stoned the Prophet ﷺ a decade earlier. He besieged it. The walls held for weeks. He eventually lifted the siege. A companion asked him to curse Thaqif. He raised his hands and made du'a: "O Allah, guide Thaqif and bring them to us." The following year, the Thaqif delegation came to Madinah and accepted Islam in full.`,
  },
  {
    episode: 44,
    title: `The Year of Delegations — Arabia Submits`,
    titleAr: `عام الوفود — العرب يدخلون في الإسلام`,
    year: `9 AH / 631 CE`,
    content: `The ninth year of Hijra is known as 'Am al-Wufud — the Year of the Delegations. After the conquest of Makkah and the Battle of Hunayn, the political reality of the Arabian Peninsula had shifted entirely. The major military powers that had opposed Islam were broken. The major cities were Muslim. The tribes of Arabia came — one after another, sometimes hundreds at a time — to Madinah to declare Islam and negotiate their place within the new Islamic state.

THE POLITICAL CONTEXT: Before 9 AH, Islam had been concentrated in the Hijaz. The peace of Hudaybiyyah had allowed Islamic teaching to spread widely but formal political submission was limited. Now, with the conquest of Makkah followed immediately by Hunayn, the tribal calculus was clear. More than that — many had been genuinely moved by the message itself and the extraordinary character of the man delivering it.

THE DELEGATION OF BANU TAMIM: One of the largest and most powerful tribes of central Arabia. They came with their poets and orators for a competition of eloquence — a formal Arab tradition. Their orator spoke impressively. Then the Prophet ﷺ commanded Thabit ibn Qays al-Ansari to respond — and by universal Arab consensus, Thabit's response exceeded the Tamimi orator's speech. Their poet recited verses. Hassan ibn Thabit (the Muslims' poet) responded. Again, Hassan's poetry was recognised as superior. The Banu Tamim delegation accepted Islam — won not by the sword but by the word.

ADI IBN HATIM (TAYY TRIBE): His father Hatim al-Ta'i was the most legendary figure for generosity in all of Arabian history. Adi had been Christian and had fled to Syria when Islam approached. His sister was captured in a Muslim raid, brought to Madinah, and the Prophet ﷺ honoured and freed her with a gift. She wrote to her brother: "Go to this man." Adi came. He arrived while the Prophet ﷺ was in the mosque. A weak old woman came and spoke to the Prophet ﷺ at length — he stood and listened to her entire concern.

Adi said to himself: "This is no king." He was brought to the Prophet's ﷺ house. There was no furniture — the Prophet ﷺ gave Adi the only cushion in the house and sat on the floor himself. Adi said: "I knew then this was not the manner of a king." He said: "I see your people are few, but I see this light spreading before you — until it fills the distance between East and West." He accepted Islam.

THAQIF (FROM TA'IF): After the siege of Ta'if, the Thaqif sent a delegation to negotiate. They requested: could they keep their idol Al-Lat for three years? Refused. Two years? Refused. One year? Refused. Could they be exempted from destroying it themselves — let the Muslims send someone? Yes. Could they be exempted from prayer? Refused — "no good in a religion without prayer." They accepted. The Prophet ﷺ sent Abu Sufyan and Mughirah ibn Shu'bah to destroy Al-Lat. Mughirah struck it with an axe while the people of Ta'if — expecting a divine punishment to fall on him — watched. Nothing happened. The idol fell. Ta'if became Muslim.

THE SCALE OF 9 AH: By the end of 9 AH, political Islam covered virtually all of the Arabian Peninsula. Kings of Yemen, Hadramawt, Oman, Bahrain — all had submitted. The transformation from 610 CE to 631 CE — from a single man in a cave to the sovereign of the largest territory in Arabia — is historically unprecedented.

THE QURAN COMMENTED: "When the victory of Allah has come and the conquest, and you see the people entering into the religion of Allah in multitudes — then exalt in praise of your Lord and ask forgiveness of Him." (110:1-3). Abu Bakr wept when he heard this surah. When asked why, he said: "This tells us that the death of the Prophet ﷺ is near — the mission is complete." He was right.`,
  },
  {
    episode: 45,
    title: `The Children of the Prophet ﷺ — Joys and Sorrows`,
    titleAr: `أبناء النبي ﷺ — الأفراح والأحزان`,
    year: `Lifetime`,
    content: `The Prophet ﷺ experienced the full range of parental emotion — the joy of birth, the love of raising children, and the devastating grief of outliving them. His relationship with his children and grandchildren is one of the most humanly revealing aspects of the Seerah, showing a man of tenderness and love who nonetheless bore his losses with faith.

THE CHILDREN OF KHADIJAH: She bore him six children — two sons and four daughters. Both sons died in infancy.

AL-QASIM was the eldest and first to die. The Prophet ﷺ was known by his kunya (teknonym) as Abu al-Qasim — Father of Qasim — throughout his life. Al-Qasim lived approximately two years. When he died, the Quraysh mocked the Prophet ﷺ as "abtar" — cut off, with no male heir to continue his line. Allah revealed Surah Al-Kawthar: "Indeed, We have given you al-Kawthar. So pray to your Lord and sacrifice. Indeed, your enemy is the one who is cut off." His enemy Abu Jahl, not the Prophet ﷺ, would be "cut off" — without lasting legacy.

ABDULLAH (also called al-Tayyib and al-Tahir) was the second son, born after prophethood and also died in infancy.

THE FOUR DAUGHTERS: All four survived into adulthood and accepted Islam.

ZAYNAB (the eldest) was married to Abu al-As ibn al-Rabi'. He was still a polytheist when the Hijra occurred — she migrated to Madinah, he remained in Makkah. He was captured at Badr. When the Qurayshi women sent ransom money for their men, Zaynab sent a necklace that had belonged to Khadijah — a piece of her mother's jewellery. When the Prophet ﷺ saw it, he was moved profoundly. He turned to his companions and said: "If you see fit to release her captive and return to her what she sent..." They agreed unanimously. Abu al-As was released on condition he send Zaynab to Madinah. He kept his word — she migrated. Years later, Abu al-As himself accepted Islam and they were reunited. She died in Madinah before her father.

RUQAYYAH was first married to a son of Abu Lahab — who divorced her when his father declared enmity to Islam. She then married Uthman ibn Affan (RA) and migrated with him to Abyssinia — twice. She returned to Madinah but became ill and died while the battle of Badr was being fought. When the Prophet ﷺ returned victorious from Badr, one of his first acts was to go to her grave.

UMM KULTHUM married Uthman ibn Affan after Ruqayyah's death, earning Uthman the title "Dhu al-Nurayn" (Possessor of the Two Lights) for having married two daughters of the Prophet ﷺ. She also predeceased her father.

FATIMAH was the youngest and the one who survived the longest after her father. She was the most beloved to him — "Fatimah is a part of me. Whoever angers her angers me." She married Ali ibn Abi Talib and bore him Hassan, Husayn, Zaynab, and Umm Kulthum. When the Prophet ﷺ was on his deathbed, he whispered something to her that made her weep — then whispered again and she smiled. 'Aishah asked what he said. She waited until after his death to tell: "He told me he was about to die — I wept. Then he told me I would be the first of his family to follow him — and I smiled." She died six months after him — the first of his family to follow, as he had promised.

IBRAHIM — THE SON OF MARIYAH: The Prophet ﷺ had a son in his final years through Mariyah al-Qibtiyyah, the Egyptian woman given to him by the Mukawqis. Ibrahim was born in Dhul-Hijjah 8 AH and lived for approximately eighteen months. The Prophet ﷺ's joy at his birth was profound — he distributed dates to the community, named the boy after the Prophet Ibrahim (AS), had him nursed by a woman in the outskirts of Madinah, and visited him frequently.

Ibrahim died in the Prophet's ﷺ arms. The Prophet ﷺ wept — his tears falling on the boy's face. He said: "The eye weeps and the heart grieves — but we say only what our Lord is pleased with. And we are grieved by your departure, O Ibrahim." On the day Ibrahim died, there was a solar eclipse. The people said: "The sun eclipsed because of the death of Ibrahim." The Prophet ﷺ said immediately: "The sun and moon do not eclipse for the death or life of any person — they are two of Allah's signs. When you see them, pray and make du'a." Truth over sentiment, even in grief.`,
  },
  {
    episode: 46,
    title: `Usama's Army — The Prophet's ﷺ Final Command`,
    titleAr: `جيش أسامة — آخر أمر للنبي ﷺ`,
    year: `11 AH / 632 CE`,
    content: `In the weeks before his death, even as the illness was beginning, the Prophet ﷺ made one of his most consequential and symbolically loaded military decisions: he appointed Usama ibn Zayd ibn Harithah as commander of an expedition to the northern borders of Arabia — and insisted on this appointment despite controversy, in what became his final military command.

USAMA IBN ZAYD: He was approximately seventeen to twenty years old — the son of Zayd ibn Harithah (the Prophet's ﷺ freed slave) and Umm Ayman (who had served the Prophet ﷺ since childhood and whom he called "my mother after my mother"). Usama had grown up in the Prophet's ﷺ household as part of his immediate family. He was deeply loved — the Prophet ﷺ would carry him on one leg and Hassan ibn Ali on the other leg and say: "O Allah, love them both, for I love them both."

THE PURPOSE OF THE EXPEDITION: The expedition was directed toward Mu'ta in southern Syria — the same region where three years earlier, in the Battle of Mu'ta, Usama's father Zayd (RA) had been killed leading the Muslim army. Appointing Usama commanded revenge his father's death, projected Muslim power northward toward Byzantine territory, and established the principle of Muslim military reach beyond Arabia.

THE CONTROVERSY: Voices in Madinah objected to Usama's appointment — he was too young to command an army that contained senior companions, including men like Abu Bakr, Umar, and other major figures. The murmuring reached the Prophet ﷺ. He came out while ill, with a cloth wrapped around his head, mounted the pulpit, and said with unusual firmness:

"O people, I have been told you object to my appointment of Usama. By Allah, if you object to me appointing Usama, you objected to me appointing his father Zayd before him — and by Allah, Zayd was worthy of the command and his son Usama is worthy of the command after him. Proceed with the army of Usama."

He repeated "Proceed with the army of Usama" three times — one of the few military commands he gave with this level of emphasis. He tied the flag of the expedition himself with his own hands and gave it to Usama.

THE ARMY CAMPS AT AL-JURF: The army assembled and camped at al-Jurf, on the outskirts of Madinah. Then news came that the Prophet ﷺ was critically ill. The commanders returned to Madinah. The Prophet ﷺ died before the army had departed.

ABU BAKR'S DECISION: When Abu Bakr became caliph and the Arabian Peninsula erupted in apostasy and the wars of Ridda (return from Islam) began, his advisors urged him to redirect Usama's army — the best Muslim fighters — to suppress the apostasy. Abu Bakr refused categorically: "By Allah, I will not untie a flag that the Messenger of Allah ﷺ tied himself." He sent Usama's army to Syria as commanded. They completed their mission successfully and returned. Their return with victory was the turning point that stabilised the Islamic state during the Ridda crisis.

THE SIGNIFICANCE: The Prophet's ﷺ insistence on Usama's appointment carried multiple lessons for all time: the criterion for leadership is capability, not age or social status; the commands of the Prophet ﷺ are not subject to popular override; and the choices made by prophetic instruction carry barakah that outlasts the objections of the moment. Abu Bakr's refusal to redirect the army — even in a genuine crisis — was one of the greatest acts of prophetic fidelity in the entire history of the caliphate.`,
  },
  {
    episode: 47,
    title: `The Companions of Badr — The Greatest Generation`,
    titleAr: `أصحاب بدر — الجيل الأعظم`,
    year: `2 AH onwards`,
    content: `The companions who fought at Badr — approximately 313 men — hold a unique and permanent status in Islamic history and theology. The Prophet ﷺ said of them: "Perhaps Allah has looked at the people of Badr and said: 'Do whatever you wish — I have forgiven you.'" (Bukhari, Muslim). They are the companions' companions — the innermost circle of the first generation.

Understanding who they were, where they came from, and what made them extraordinary is essential to understanding what Islam produced in its first generation.

ABU BAKR AL-SIDDIQ: The closest man to the Prophet ﷺ, who had never worshipped an idol. He wept more than any other companion when the Quran was recited. The Prophet ﷺ said: "If I were to take a khalil (closest friend) from my Ummah, I would take Abu Bakr — but the brotherhood of Islam is enough." He spent his entire wealth for Islam, purchasing the freedom of tortured slaves, funding the Hijra, equipping the armies.

UMAR IBN AL-KHATTAB: Before Islam, he was feared. After Islam, he channelled that fear-inspiring quality into the service of truth. His directness — which had been a social weapon — became a compass for the community. The Prophet ﷺ said: "Allah placed the truth on Umar's tongue and in his heart." The hypocrites feared him. The enemies of Islam feared him. He feared only Allah.

UTHMAN IBN AFFAN: The Prophet ﷺ said no one had hurt him more than the death of his daughter Ruqayyah, Uthman's wife. He was the most generous of the companions after Abu Bakr — fitting out the army of difficulty (jaysh al-'usrah) for Tabuk entirely from his own wealth. He had a shyness that even the angels respected: the Prophet ﷺ said: "Should I not be modest before a man before whom the angels are modest?"

ALI IBN ABI TALIB: Who had grown up in the Prophet's ﷺ household, never known anything but Islam, and bore the Prophet's ﷺ standard at the most critical moments. The Prophet ﷺ said to him at Khaybar: "I will give this standard to a man who loves Allah and His Messenger and whom Allah and His Messenger love." Then he sent for Ali. He described him saying: "You are from me and I am from you."

SA'D IBN ABI WAQQAS: One of the six people the Prophet ﷺ explicitly promised Paradise to during his lifetime. He was the first person to shed blood in the path of Islam — shooting the first arrow in Islamic history. He was the commander who would conquer Persia. The Prophet ﷺ said: "O Allah, respond to Sa'd's du'a when he makes du'a." Sa'd's prayers became legendary for their acceptance.

BILAL IBN RABAH: Whose adhan opened every day of Islamic life in Madinah. He was the first muadhin of Islam. After the conquest of Makkah, he climbed to the roof of the Ka'bah — the former slave, who had been pressed into the burning sand of that very city — and called the adhan over Makkah. Some of the Qurayshi nobles turned their faces away in humiliation. Some accepted Islam in their hearts at that moment.

ABD AL-RAHMAN IBN 'AWF: The wealthiest of the companions who made their money in Islam (not from inheritance). He arrived in Madinah with nothing but his body. He built one of the greatest trading empires in Arabia through honest dealing. Yet when he arrived in the Prophet's ﷺ presence, he wept. When asked why, he said: "I fear I will be judged by my wealth." The Prophet ﷺ said: "I testify you are a man of goodness." He entered Paradise among the very last of the wealthy — taking a long account of his wealth, but entering.

MU'ADH IBN JABAL: The most knowledgeable of the companions in what was lawful and unlawful. The Prophet ﷺ said: "The most knowledgeable of my Ummah in what is permitted and forbidden is Mu'adh ibn Jabal." He was sent as the teacher and judge to Yemen. He would pass by people, stop his mount, and say: "Sit with me and let us believe for an hour" — meaning: let us remember Allah together. He died in the plague of Amwas at approximately thirty-three years old, in Syria, among the earliest lands Islam had entered.

WHAT MADE THEM EXTRAORDINARY: They were ordinary people who lived extraordinary faith. They were merchants, shepherds, slaves, nobles, farmers, poets. What they shared was: they heard the Prophet ﷺ speak, they saw him live, and they believed him completely. Their belief was not theoretical — it transformed every aspect of their lives, from how they ate to how they died. The Prophet ﷺ said: "The best of people are my generation, then those who follow them, then those who follow them." They were the standard against which every subsequent Muslim generation measures itself.`,
  },
  {
    episode: 48,
    title: `The Prophet ﷺ as Leader and Governor`,
    titleAr: `النبي ﷺ حاكماً وقائداً`,
    year: `1–11 AH`,
    content: `The Prophet ﷺ was not only a spiritual guide — he was the head of state, commander-in-chief, chief justice, and legislator of the first Islamic state simultaneously. How he performed these roles — and the principles he established — form the basis of Islamic political thought.

CONSULTATION (SHURA): The Prophet ﷺ was the recipient of divine revelation — if anyone had the right to rule by personal decree, it was him. Yet he consistently consulted his companions on matters of worldly strategy and governance. Before Badr, he consulted about whether to intercept the caravan or engage the army. Before Uhud, he consulted on whether to fight from within Madinah or go out. At the Trench, he adopted Salman al-Farisi's suggestion of the ditch. In the Hudaybiyyah negotiations, he consulted Umm Salamah about how to approach the companions' reluctance to shave their heads.

Why did a man receiving revelation consult others? Because consultation itself is a command of Allah: "And consult them in the matter." (3:159). And because he was establishing the precedent for every leader after him who would not have revelation.

THE DISTRIBUTION OF JUSTICE: The Prophet ﷺ applied the law without discrimination — a principle he stated explicitly: "If Fatimah the daughter of Muhammad stole, I would cut off her hand." A case is reported from the early Madinan period where a companion was found guilty of theft. The Prophet ﷺ ordered the punishment. Another companion interceded. The Prophet ﷺ said: "Do you intercede in one of Allah's fixed punishments?" Then he gave the famous statement about how nations were destroyed before them.

He also corrected his own officials publicly. When Mu'adh ibn Jabal led prayers in the mosque that were too long — so long that a man had to leave — the Prophet ﷺ was publicly displeased and rebuked Mu'adh, saying: "You are a fitnah-maker. People have needs and lives." Even the most beloved companions received correction when they erred.

THE WELFARE STATE: The Prophet ﷺ established that the Islamic state is responsible for those who cannot care for themselves. He said: "I am the closest of all people to the believers — whoever leaves wealth, it is for his heirs, and whoever leaves debt or dependent family, it is for me to take care of." He paid the debts of deceased Muslims from the state treasury. He established stipends for the poor from the zakah funds. He personally ensured the Ahl al-Suffah were fed from his own food.

TREATMENT OF NON-MUSLIMS: The Constitution of Madinah had established the rights of non-Muslims within the Islamic state — they were part of the ummah in the political sense, maintained their own religious courts, contributed to the common defence, and were protected by the same obligations of the state. The Prophet ﷺ said: "Whoever harms a dhimmi (non-Muslim citizen) harms me." He would stop and listen to the complaints of non-Muslim subjects with the same attention he gave to Muslims.

A famous incident: a Jewish funeral passed by and the Prophet ﷺ stood up out of respect. His companions said: "O Messenger of Allah, it is a Jewish funeral." He said: "Is it not a soul?" He stood for a human being — not for a religion, not for a tribe, but for a soul departing this world.

DIPLOMACY: He managed relations with multiple powers simultaneously — Quraysh, the Jewish tribes, the Byzantine Empire, the Persian Empire, the tribal confederations, the Abyssinian kingdom. His diplomatic correspondence was precise and principled. His treaties were kept to the letter — when Abu Sufyan's treaty violation at Hudaybiyyah gave him the opening to march on Makkah, he documented the violation carefully before acting.

THE PROPHET ﷺ AS A JUDGE: He listened. He did not rush to judgment. In complex family disputes, he would hear all sides. In criminal cases, he followed the evidence rigorously. When uncertain, he waited for revelation. When revelation came, he applied it regardless of who it favoured.

He was the model of governance that the Islamic world would aspire to — and periodically achieve — for fourteen centuries.`,
  },
  {
    episode: 49,
    title: `The Prophet's ﷺ Relationship with Allah — His Worship`,
    titleAr: `علاقة النبي ﷺ بربه — عبادته`,
    year: `Lifetime`,
    content: `To understand the Prophet ﷺ completely, one must understand not only what he did in the world but what he was in his private relationship with Allah. His worship — the degree and quality of it — is among the most extraordinary aspects of his character, and it provides the source from which everything else flowed.

THE NIGHT PRAYER (QIYAM AL-LAYL): 'Aishah (RA) described his night prayer with a detail that makes the practice vivid. He would sleep for the first part of the night, then wake — often a third of the way through the night, or halfway, or in the final third. He would use a miswak (tooth stick), perform ablution, and then pray. He would stand so long in prayer that his feet became swollen. 'Aishah asked: "O Messenger of Allah, why do you do this when Allah has forgiven you all past and future sin?" He replied: "Should I not be a grateful servant?"

The scholars note: this was not performance. No one was watching at 2 AM. This was the private conversation of a man with his Lord — extended because he did not want it to end.

HIS RECITATION: Hudhayfa ibn al-Yaman (RA) described praying behind the Prophet ﷺ one night. He recited Al-Baqarah, then Al-Nisa, then Al-'Imran — not rushing through them, but stopping at every verse of mercy to ask for it, and at every verse of punishment to seek refuge from it. The prayer lasted through much of the night.

HIS DU'A: His supplications were the most comprehensive collection of human prayer in existence. He made du'a in the morning and evening (documented in detail), when entering and leaving the mosque, when eating and drinking, when putting on clothes, when going to sleep, when waking, when entering and leaving the house, when it rained, when wind blew, during thunder. Every moment of life had its remembrance of Allah. He said: "Whoever says 'Glory be to Allah and His praise' a hundred times a day, his sins will be wiped away even if they are like the foam of the sea."

HIS CRYING: He wept in prayer frequently. The companions could hear the sound of his chest like a boiling kettle when he cried in prayer. He cried when the Quran was recited to him — he asked Ibn Masud to recite, and when Ibn Masud reached "So how would it be when We bring from every nation a witness, and We bring you against these as a witness?" (4:41) — the Prophet ﷺ said: "Enough." His eyes were filled with tears.

HIS FASTING: Beyond the obligatory Ramadan, he fasted Mondays and Thursdays — "because my deeds are presented to Allah on Mondays and Thursdays, and I wish to be fasting when they are presented." He fasted three days of every lunar month (the "White Days" — 13th, 14th, 15th). He fasted much of Sha'ban in preparation for Ramadan. He fasted 'Ashura (the 10th of Muharram) and recommended the 9th to be added.

HIS DHIKR: The companions reported that his lips moved continuously with remembrance of Allah throughout his daily activities. He said of the dhikr of Allah: "There is nothing more beloved to Allah in which you store away good deeds than saying: 'Subhan Allah wa bihamdihi'" — and he would say it a hundred times every day.

HIS TAWAKKUL (RELIANCE ON ALLAH): This was perhaps the most distinctive quality of his inner life. From the moment in the cave of Hira to the moment of death, his reliance on Allah was total and unshaken. In the cave of Thawr, surrounded by hunters, he said: "Do not grieve — Allah is with us." At Badr, with 313 men facing 950, he prayed until his cloak fell from his shoulders. At Ta'if, bleeding and alone, he made du'a. At every moment of external threat, his response was internal: turn to Allah.

He said: "If you were to rely upon Allah with true reliance, He would provide for you as He provides for the birds — they go out hungry and return full." He was the living example of this teaching. His trust was not passive — he made all necessary preparations, then relied on Allah for the outcome.`,
  },
  {
    episode: 50,
    title: `The Prophet's ﷺ Treatment of the Poor and Weak`,
    titleAr: `معاملة النبي ﷺ للفقراء والضعفاء`,
    year: `Lifetime`,
    content: `If there is one consistent thread through the entire Seerah — from the first revelation to the last day — it is the Prophet's ﷺ extraordinary orientation toward the poor, the weak, the marginalised, and the forgotten. This was not occasional charity but the defining character of his social orientation.

THE FIRST QUALITY KHADIJAH NAMED: When she described to Waraqa ibn Nawfal the character of the man who had received revelation, the qualities she named were: he maintains family ties, he speaks the truth, he helps the poor, he honours his guests, he helps people in genuine difficulty. The poor were the third quality she named — and they are mentioned before abstract virtues because this was something visible and consistent in him.

HIS POVERTY BY CHOICE: The Prophet ﷺ could have been wealthy. The Quraysh had offered him their wealth. The conquests brought enormous resources to the Islamic state. He lived in a mud-brick room that a man could touch the ceiling of, ate barely enough to sustain himself, wore patched clothing, and slept on a mat that left marks on his skin. When Umar (RA) visited him and saw the marks on his skin from sleeping on the rough mat, he wept. The Prophet ﷺ said: "O Umar, are you not pleased that for them is this world and for us is the Hereafter?"

He said: "O Allah, cause me to live as a poor man, cause me to die as a poor man, and gather me in the company of the poor." 'Aishah asked: why do you pray for poverty? He said: "Because the poor will enter Paradise forty years before the wealthy."

THE COMPANIONS HE CHOSE: His closest companions included men from every social class. But in his personal affections, he showed particular warmth for those the world had discarded. Bilal — a slave. Ammar — a son of slaves. Khabbab — a blacksmith. Zayd — a freed slave. Suhaib al-Rumi — a man whose origins were lost in the slave trade. Abdullah ibn Masud — a poor shepherd boy who had presented himself to the Prophet ﷺ asking to serve him and was treated like a member of the household.

Abu Dharr al-Ghifari (RA) described asking the Prophet ﷺ about the best deed. The Prophet ﷺ said: "Prayer at its proper time and doing good to your parents." Abu Dharr pressed: "What else?" Each time the Prophet ﷺ described more — and eventually said: "Jihad in the path of Allah." Then: "Which people will be saved?" The Prophet ﷺ said: "The one who does good with his wealth and person." Abu Dharr said: "O Messenger of Allah, I have no wealth." The Prophet ﷺ said: "Then remove harm from the path of people — that is charity for you."

He democratised goodness. If you have nothing, you still have something to give.

THE WOMEN: The Prophet ﷺ lived in a society where women were property. He declared them to be full human beings with rights, dignity, and standing before Allah. He said: "The best of you is the best to his wives." He helped in the house — cooking, mending clothes, serving himself — so that his wives never felt like servants. He stood when his daughter Fatimah entered a room, out of love and respect.

He said: "Fear Allah regarding women — you have taken them as a trust from Allah and made their bodies lawful through the word of Allah." The Islamic legal revolution regarding women's property rights, divorce rights, inheritance rights — all came from a man who the West of his era (and much of Arabia) would have considered radical in his championing of women.

THE CHILDREN: He played with children in the street. He carried his grandsons Hassan and Husayn on his back during prostration, prolonging the sujud so as not to disturb them. When Usama ibn Zayd was a child, the Prophet ﷺ would carry him in one arm and Hassan in the other and say: "O Allah, love them both, for I love them both." He kissed children publicly — in a society where this was unusual for men — saying: "Whoever does not show mercy will not be shown mercy."

He brought the orphan into his family by personal example — he himself had been an orphan, and he said: "I and the one who cares for an orphan are like this" — and he held up his two fingers together. Every orphan, every slave, every poor woman in the community had in him the most powerful man of the era as their advocate.`,
  },
  {
    episode: 51,
    title: `The Battle of Mu'ta — First Encounter with Byzantine Power`,
    titleAr: `غزوة مؤتة — أول مواجهة مع الروم`,
    year: `8 AH / 629 CE`,
    content: `The Battle of Mu'ta — fought in the region of present-day Jordan — was the first major military encounter between the Muslims and the Byzantine Empire, and it was a battle of extraordinary heroism against overwhelming odds. Though it ended without clear victory, it established the fighting reputation of the Muslim army in the minds of the world's greatest military power at the time.

THE CAUSE: The Prophet ﷺ had sent an envoy named al-Harith ibn Umayr al-Azdi to the governor of Busra in southern Syria with a letter of invitation to Islam. Shurahbil ibn Amr al-Ghassani — a client king under Byzantine authority — intercepted the envoy and killed him. The killing of diplomatic envoys was among the gravest violations of the law of nations in that era. The Prophet ﷺ responded with a military expedition.

THE FORCE: Three thousand Muslim fighters were sent — the largest force sent outside Arabia up to that point. The Prophet ﷺ appointed three commanders in sequence: "Zayd ibn Harithah is your commander. If Zayd is killed, then Ja'far ibn Abi Talib. If Ja'far is killed, then Abdullah ibn Rawahah. If he is killed, the Muslims should choose a leader from among themselves."

THE ODDS: When the Muslim army reached the region of Mu'ta, they found the Byzantine force vastly larger than expected — some narrations say 100,000 Byzantine and allied Arab troops, others say 200,000. Whatever the exact number, the disparity was extreme: 3,000 versus an army of many times that number.

The companions conferred. Some suggested sending word to the Prophet ﷺ and waiting for reinforcements or orders. Abdullah ibn Rawahah — one of the greatest poets of the companions — said something that has been remembered for centuries: "O people, by Allah, what you dislike is exactly what you came out for — martyrdom. We are not fighting with numbers or weapons or strength — we are fighting with this religion that Allah has honoured us with. So march, and it will only be one of two good things: victory or martyrdom."

ZAYD IBN HARITHAH'S FALL: The Prophet ﷺ later described what he saw, as if watching from Madinah: "Zayd took the standard and fought until he fell." Zayd ibn Harithah — the Prophet's ﷺ freed slave who had chosen to stay with him over his own father, the man named in the Quran, the man who had been like a son — was killed fighting against thousands.

JA'FAR IBN ABI TALIB'S MARTYRDOM: When Zayd fell, Ja'far took the standard in his right hand and fought until his right arm was severed. He took the standard in his left hand and fought until his left arm was severed. He clasped the standard to his chest with his stumps until he fell — struck by numerous blows. When his body was examined afterward, he had ninety wounds from the front — not one from the back. He had not turned to flee.

The Prophet ﷺ, in Madinah, received the news through revelation as it happened. He described it in the mosque with tears on his cheeks. He said: "Zayd took the standard and was struck, then Ja'far took it and was struck, then Abdullah ibn Rawahah took it and was struck." There was silence in the mosque. Then: "Then one of the swords of Allah took it — until Allah gave them victory." The sword of Allah was Khalid ibn al-Walid, who took command after Abdullah ibn Rawahah was also killed, and managed a tactical withdrawal that preserved the army.

JA'FAR'S CHILDREN: When the Prophet ﷺ went to Ja'far's house to tell his wife Asma' bint Umays of her husband's death, he asked for Ja'far's children — Abdullah, Awf, and Muhammad. He embraced them and wept over them. He said: "O Allah, be the guardian of Ja'far's family." Then to Asma' bint Umays: "Give my salam (peace/greetings) to Ja'far and tell him: Allah has given you two wings with which you fly in Paradise wherever you wish." Hence Ja'far ibn Abi Talib became known as Ja'far al-Tayyar — Ja'far the Flyer.

The Battle of Mu'ta told Byzantium that there were men in Arabia willing to fight 100 to 1 and not retreat in their hearts even if they retreated tactically. Two years later, it would be time to face that power directly.`,
  },
  {
    episode: 52,
    title: `The Tabuk Expedition — The Army of Difficulty`,
    titleAr: `غزوة تبوك — جيش العسرة`,
    year: `9 AH / 631 CE`,
    content: `The Tabuk expedition — the largest and most distant military campaign of the Prophet's ﷺ lifetime — was a test of the Muslim community's faith at every level. It is the subject of extensive Quranic revelation and reveals, through the responses of different people, the full spectrum of the Muslim community's sincerity.

THE CONTEXT: In 9 AH, news reached Madinah that the Byzantine Emperor Heraclius was assembling a massive army in southern Syria — some reports said 40,000 men, others said far more — with the intention of invading the Hijaz and crushing the Islamic state before it could consolidate further after the conquest of Makkah. The Prophet ﷺ took the unusual step of announcing the destination publicly — something he normally kept secret.

THE DIFFICULTY: The timing made this the hardest possible expedition. It was the peak of summer heat in the Arabian Peninsula — one of the most brutally hot seasons in memory. The date palms were laden with ripe fruit — exactly the time the Ansari farmers needed to be present to harvest. The journey to Tabuk was approximately 700 kilometres from Madinah — an enormous distance. Provisions and mounts were critically short.

THE RESPONSES — THREE CATEGORIES:

THE SINCERE: Abu Bakr al-Siddiq brought all of his wealth — the scholars say everything he owned. When the Prophet ﷺ asked: "What did you leave for your family?" He said: "Allah and His Messenger." Umar (RA) brought half of everything he owned. Uthman ibn Affan equipped the entire expedition personally — providing 1,000 camels, 70 horses, and 1,000 dinars in gold. The Prophet ﷺ said: "Nothing Uthman does after today can harm him" — a statement some scholars interpret as a guarantee of his salvation.

THE EXCUSED: Some Muslims genuinely could not go — too poor to equip themselves. They came to the Prophet ﷺ weeping because they had no mounts. He had nothing to give them. They turned and left weeping. The Quran described them: "Nor upon those who, when they came to you that you might give them mounts, you said 'I can find no mounts for you,' they turned back while their eyes overflowed with tears out of grief that they could not find something to spend." (9:92)

THE HYPOCRITES: The Munafiqun found every excuse. "Permission me — do not expose me to trial" (9:49), Allah recorded their excuses. "The heat is intense" — Allah responded: "Say: the fire of Hell is more intense in heat, if they would but understand." (9:81)

THE THREE WHO STAYED BEHIND WITHOUT EXCUSE: Three men — Ka'b ibn Malik, Murarah ibn al-Rabi', and Hilal ibn Umayyah — had no reason not to go. They simply found themselves procrastinating, missing the army's departure, and then unable to catch up. Ka'b ibn Malik's story, as he told it himself (recorded in Bukhari), is one of the most moving accounts in the Seerah.

When the Prophet ﷺ returned from Tabuk and Ka'b came to him, the Prophet ﷺ waited for his explanation. When he said simply: "By Allah, I had no excuse — Allah blessed me with health and capacity," the Prophet ﷺ told him: "This one has spoken truthfully. Stand until Allah decides about you." The Prophet ﷺ then declared a social boycott on the three: no Muslim was to speak to them. For fifty days — not in prison, but in a social silence so profound that Ka'b said the earth felt strange to him. His own wife sought permission to stay elsewhere. He wept. He prayed. Then, after fifty days, Allah revealed their acceptance: "And He also accepted the repentance of the three who were left behind... then He turned to them in forgiveness so they could repent." (9:118).

Ka'b said: "By Allah, I am not aware of any blessing Allah has given me after Islam greater than my truthfulness to the Messenger of Allah ﷺ — that I did not lie to him."

THE OUTCOME: The Byzantine army, hearing of the enormous Muslim force approaching, dispersed. No battle was fought. The Prophet ﷺ concluded treaties with the border tribes and returned. Tabuk was a strategic demonstration — projecting Muslim power to the northern borders — and a theological crucible that separated, in the Quran's own words, the true believers from those merely going through the motions.`,
  },
  {
    episode: 53,
    title: `The Quran — How It Was Revealed and Preserved`,
    titleAr: `القرآن الكريم — كيف نزل وكيف حُفِظ`,
    year: `610–632 CE`,
    content: `The Quran is the central miracle of Islamic history — the only miracle of the Prophet ﷺ that remains in its original form for every person in every generation to examine. Understanding how it was revealed and how it was preserved during the Prophet's ﷺ lifetime is essential to understanding the Seerah.

THE NATURE OF REVELATION: The Prophet ﷺ described the experience of receiving revelation in different ways. Sometimes it came like the ringing of a bell — the most intense form, which he then found the words fully present in his heart when the intensity passed. Sometimes Jibreel (AS) came to him in the form of a man and spoke to him directly. Sometimes revelation came while he was on his camel and the camel would kneel under the weight of what was descending. His companions noticed physical signs — profuse sweating even on cold days, his colour changing, heaviness in his body.

He was commanded not to move his tongue trying to memorise before Jibreel finished: "Do not move your tongue with it to hasten with it. Indeed, upon Us is its collection and its recitation." (75:16-17). Allah guaranteed the preservation of the Quran Himself: "Indeed, it is We who sent down the reminder and indeed, We will be its guardian." (15:9).

THE PROCESS OF REVELATION: The Quran was not revealed all at once but over twenty-three years — approximately thirteen years in Makkah and ten in Madinah. The Makkan surahs are generally shorter, more intense, more focused on creed, faith, and the hereafter. The Madinan surahs are generally longer, more detailed, more focused on law, society, and practical guidance. Each revelation came in response to real events, real questions, real needs — making the Quran both timeless in its principles and precisely rooted in history.

THE SCRIBES OF REVELATION: The Prophet ﷺ had dedicated scribes who would record each revelation immediately. Among the most prominent: Zayd ibn Thabit (RA) — the young Ansari who had learned Hebrew and Syriac in addition to Arabic and became the chief scribe of revelation. Also: Ali ibn Abi Talib, Mu'awiyah ibn Abi Sufyan (after his conversion), Uthman ibn Affan, and others. The Prophet ﷺ would dictate where each verse was to be placed — "place this verse after verse such-and-such in surah such-and-such" — establishing the arrangement of the Quran as we have it today.

ORAL MEMORISATION: Beyond written recording, the Quran was memorised orally by thousands of companions during the Prophet's ﷺ lifetime. The Prophet ﷺ reviewed the entire Quran with Jibreel once every Ramadan, and twice in his final year. The Quran was recited in every prayer five times a day — making it the most frequently recited text in the history of the world. Companions competed to memorise more. The huffaz (memorisers) were honoured specially — so much so that the Prophet ﷺ said: "The Quran intercessor will come on the Day of Judgement for those who read it."

THE FIRST COMPILATION: After the Battle of Yamama (post-Prophet's ﷺ death) in which 70 of the huffaz were killed fighting Musaylimah the false prophet, Umar ibn al-Khattab (RA) urgently went to Abu Bakr and said: "I fear that many huffaz will die and portions of the Quran will be lost." Abu Bakr initially hesitated — how could he do something the Prophet ﷺ had not done? Umar kept pressing until Abu Bakr said: "By Allah, this is good." He summoned Zayd ibn Thabit, who went through the same hesitation — how could he do something the Prophet ﷺ had not commanded?

Zayd then undertook the most meticulous textual verification project in early history: he accepted no verse unless it was confirmed by two witnesses of the written text combined with the testimony of people who had heard it directly from the Prophet ﷺ. The result was a single mushaf (codex) kept with Abu Bakr, then Umar, then Umar's daughter Hafsa.

UTHMAN'S STANDARDISATION: When the Islamic state spread and different dialectal readings began causing confusion, Uthman ibn Affan (RA) commissioned a committee under Zayd ibn Thabit to produce copies from Hafsa's mushaf and distribute them to the major cities — Makkah, Madinah, Basra, Kufa, Syria — with an expert reciter to teach the correct reading. All other written copies were burned to prevent divergence.

This mushaf — the 'Uthmani mushaf — is what every Muslim reads today, in exactly the same text, from Morocco to Indonesia, from Chechnya to South Africa. Fourteen centuries. One text.`,
  },
  {
    episode: 54,
    title: `The Prophet ﷺ and the Non-Muslims — Relations with Other Faiths`,
    titleAr: `النبي ﷺ وغير المسلمين — العلاقة مع أهل الأديان`,
    year: `Lifetime`,
    content: `The Prophet's ﷺ relationships with non-Muslims — Jews, Christians, polytheists, and others — are among the most misunderstood and most important aspects of his legacy. Understanding them correctly requires separating political/military relationships from personal and social ones.

THE FUNDAMENTAL DISTINCTION: The Islamic tradition makes a clear distinction between: (1) non-Muslims as individuals to be treated with dignity, justice, and compassion; and (2) political entities that may or may not be at war with the Islamic state. The Prophet's ﷺ relationships were shaped by this distinction throughout.

WITH THE JEWISH TRIBES: The Constitution of Madinah established a formal framework of coexistence. The Prophet ﷺ maintained social relations with Jewish neighbours — he visited sick Jewish neighbours, he borrowed from Jewish merchants (the reported incident of a Jewish creditor demanding his money on the day of the Prophet's ﷺ death, and the Prophet ﷺ immediately paying from what was available), he stood when a Jewish funeral passed by out of respect for the departing soul.

His conflicts with specific Jewish tribes — Banu Qaynuqa', Banu al-Nadir, Banu Qurayza — were responses to specific political and military treaty violations, not anti-Semitism. The Jewish scholar Abdullah ibn Salam (RA) — one of their most learned rabbis — converted to Islam and remained among the Prophet's ﷺ most respected companions. The Prophet ﷺ confirmed that he was among those promised Paradise.

WITH CHRISTIANS: His relationship with the Negus of Abyssinia was one of genuine mutual respect — a non-Muslim king who sheltered the early Muslims and later privately accepted Islam, whom the Prophet ﷺ honoured with a funeral prayer in absentia. The Prophet ﷺ also maintained his treaty with the Christian community of Najran — a detailed treaty that guaranteed the security of their churches, their priests, their property, and their way of life. His famous statement to the monks of Sinai Monastery is preserved: "No Christian will be harmed in his property or his life or his church — and this is Allah's covenant with them."

WITH POLYTHEISTS: Even with the Makkans who had persecuted him for thirteen years, his personal demeanour was not one of personal hatred. When the conquest of Makkah came, he did not imprison a single person. He did not confiscate the houses of those who had taken the Muslims' property when they migrated. He said: "Go — you are free."

Key relationships that illustrate his approach:
- MUTIM IBN 'ADI (died a polytheist): Protected the Prophet ﷺ when he returned from Ta'if as a favour of honour. The Prophet ﷺ said: "If Mutim ibn 'Adi were alive today, I would release all the prisoners of Badr for his sake." For one act of nobility, he earned this testimony.
- ABD ALLAH IBN ABI SARH: Apostasized, returned to Makkah, and was initially on the list of those to be killed at the conquest. Uthman ibn Affan interceded for him. The Prophet ﷺ waited a long time in silence — hoping someone would kill him — before granting the pardon. He later accepted Islam sincerely and became a Muslim governor.
- THE BEDOUIN WHO GRABBED HIM: A rough bedouin grabbed the Prophet ﷺ by his collar so hard it left a mark on his neck, demanding money from the public treasury. The companions reacted angrily. The Prophet ﷺ laughed, ordered him given what he asked for, and spoke to him kindly.

THE PRINCIPLE: He said: "Whoever harms a dhimmi (protected non-Muslim) harms me." He said: "Fear Allah regarding women — you have taken them as a trust from Allah." He said: "The most complete of the believers in faith are those best in character — and the best of you are the best to their wives." Every human being, in his view, was a trust from Allah — deserving of dignity regardless of faith, origin, or status.`,
  },
  {
    episode: 55,
    title: `The Prophet's ﷺ Miracles — Beyond the Quran`,
    titleAr: `معجزات النبي ﷺ — ما وراء القرآن`,
    year: `Lifetime`,
    content: `The primary miracle of the Prophet ﷺ was the Quran — a miracle accessible to every person in every generation, in its linguistic beauty, its internal consistency, its preservation, and its impact. But alongside the Quran, the Seerah records numerous physical miracles (called mu'jizat) — extraordinary events that Allah manifested through His Prophet ﷺ as confirmation of his prophethood to those who witnessed them.

THE SPLITTING OF THE MOON: The Quran itself refers to one of the most extraordinary miracles: "The Hour has approached and the moon has split." (54:1). The companions — both those present and those who transmitted the narration — describe an event at Mina in Makkah when the moon visibly split into two halves before the eyes of the Quraysh, then rejoined. The Quraysh called it magic. The companion accounts of this are recorded in Bukhari and Muslim through multiple chains. Modern researchers have found references in Indian royal chronicles to "the moon splitting" approximately corresponding to this period — an observation made by those with no connection to the Islamic narrative.

THE WATER FROM HIS HANDS: On multiple documented occasions, the Prophet ﷺ placed his hand over a small amount of water or a vessel, and water flowed from between his fingers in sufficient quantity to supply hundreds of people. At Hudaybiyyah, when the army of 1,400 had little water: he placed his hand in a vessel and water flowed from his fingers until all 1,400 drank and performed ablution. Jabir ibn Abdullah (RA), who witnessed this, described it: "The water gushed and bubbled between his fingers." This is recorded in Sahih al-Bukhari.

THE FOOD MIRACLES: At the battle of the Trench, Jabir ibn Abdullah noticed how hungry the Prophet ﷺ was and went to invite him secretly for a small meal his wife had prepared — a small goat and a small measure of barley — just enough for a few people. The Prophet ﷺ announced to the entire army: "Come, all of you, to Jabir's food." Jabir was horrified — it was enough for ten people at most, not thousands. The Prophet ﷺ blessed the food and served it. The entire army ate — approximately a thousand men — and there was food remaining when they were done.

On another occasion, 'Aishah (RA) says she had a small amount of dates in a bag. The Prophet ﷺ kept giving from that bag until she thought it would never empty. It kept providing dates for days.

THE HEALING OF ALI'S EYES: Before the battle of Khaybar, Ali ibn Abi Talib had severe eye pain — so bad he could barely see. When the Prophet ﷺ called for him to give him the standard, he applied his saliva to Ali's eyes and made du'a. Ali said: "I was cured as if I had never had any pain." The next day he led the assault and Khaybar fell.

THE TREE WEEPING: In the Prophet's ﷺ early days in Madinah, he would lean against a date palm trunk while delivering the Friday sermon. When the minbar (pulpit) was constructed, he moved to the pulpit. The companions heard the sound of weeping — loud, like a pregnant she-camel in labour — from the date palm trunk. The Prophet ﷺ descended, put his hand on it, and it calmed. He said: "If I had not placed my hand on it, it would have wept until the Day of Judgement, longing for what it heard of dhikr." A tree missed the sound of the Prophet ﷺ leaning against it and speaking.

THE ANIMAL TESTIMONIES: On several occasions, animals spoke to or communicated with the Prophet ﷺ. A camel came to him complaining (in non-verbal communication understood by the Prophet ﷺ) that its owner overworked it and underfed it — the Prophet ﷺ called the owner and told him what the camel "said." A wolf, captured by shepherds and brought to the Prophet ﷺ, was said to have spoken about the Day of Judgement. The Prophet's ﷺ own camel Qaswa seemed to be guided by divine instruction when she knelt at the spot in Madinah where the mosque would be built.

THE SIGNIFICANCE OF THESE MIRACLES: The Islamic scholarly tradition notes that each prophet was given miracles most relevant to what his people prized. The people of Musa (AS) prized magic — so his miracles confounded the magicians. The people of 'Isa (AS) prized medicine — so his miracles were healings and raising the dead. The Arabs of the Prophet's ﷺ era prized eloquence and poetry — so his primary miracle was the Quran, the pinnacle of Arabic expression. The physical miracles were confirmation for those present; the Quran is the confirmation for all who come after.`,
  },
  {
    episode: 56,
    title: `The Prophet's ﷺ Companions After His Death — Their Legacy`,
    titleAr: `أصحاب النبي ﷺ بعد وفاته — إرثهم`,
    year: `11–40 AH`,
    content: `What happened to the companions after the death of the Prophet ﷺ is itself one of the great stories of history — how a community formed around a single man continued after his departure to reshape the world within two generations. The trajectory of the companions is the living testament to what the Prophet ﷺ had built.

THE IMMEDIATE CRISIS — THE RIDDA WARS: Within days of the Prophet's ﷺ death, the Arabian Peninsula erupted. Tribes that had submitted politically — but not yet been fully formed in faith — began to apostatise. False prophets appeared: Musaylimah the Liar (claiming prophethood in Yamama), Tulayha ibn Khuwaylid (in the north), Sajah bint al-Harith (a woman claiming prophethood in the east), and others.

Abu Bakr al-Siddiq faced the most severe crisis in the history of the Islamic state within weeks of becoming caliph. Some of his closest advisors suggested accommodation — what if they allowed the apostate tribes to stop paying zakat while remaining nominally Muslim? Abu Bakr's response was categorical: "By Allah, if they withhold from me a cord that they used to give to the Messenger of Allah ﷺ, I will fight them for it." He fought. The wars of Ridda lasted approximately two years and ended with the entire Arabian Peninsula returned to Islam.

THE CONQUEST OF PERSIA AND BYZANTIUM: The Prophet ﷺ had predicted both: he told his companions that his thumb would reach the white palace of Madain (the Persian capital) and the red palaces of Syria. Within twelve years of his death: The Persian Empire had fallen to Khalid ibn al-Walid, Sa'd ibn Abi Waqqas, and the Muslim armies. The Persian Emperor Yazdegerd III — the last Sassanid ruler — died as a refugee, his empire conquered by the successors of a man Khosrow had laughed at when he received the Prophet's ﷺ letter.

The Byzantine Empire — the greatest military power in the world — lost Syria, Palestine, Egypt, and North Africa to the Muslim armies within twenty years. Heraclius, who had called his officers "men of bronze" for their discipline, fled from the armies of the companions, saying: "Farewell, O Syria — what a beautiful farewell."

THE COMPANIONS AS SCHOLARS: Simultaneously with the military expansion, the companions established the scholarly infrastructure of Islamic civilisation. 'Aishah (RA) taught scholars for forty years after the Prophet's ﷺ death — her room in the mosque became one of the most important educational centres in the world. Ibn Masud established the Kufan school of jurisprudence. Ibn Abbas — "the interpreter of the Quran" — spent his entire life teaching in Makkah. Zayd ibn Thabit compiled the Quran. Muadh ibn Jabal taught in Syria until his death in the plague.

THE CITIES THEY FOUNDED: The companions founded cities that became the centres of Islamic civilisation: Basra (Iraq), Kufa (Iraq), Fustat (Egypt, now old Cairo), Qayrawan (Tunisia). Each city was built around a mosque as its centre — the model the Prophet ﷺ had established in Madinah.

THE SPREAD OF THE MESSAGE: By the time of the last companion's death — Abu Tufayl Amir ibn Wathilah, who died approximately 100 AH — Islam had spread from Spain in the west to Central Asia in the east, from the Caucasus in the north to Yemen in the south. The message delivered by one man in a cave in Makkah in 610 CE had, within a single human lifetime, become the religion of an empire larger than Rome at its height.

The Prophet ﷺ said: "Convey from me, even one verse." They conveyed. Every Muslim alive today is the product of that chain of transmission — going back, generation by generation, to the companions who sat with the Prophet ﷺ and heard him say: "Have I conveyed? O Allah, bear witness." `,
  },
  {
    episode: 57,
    title: `What the Prophet ﷺ Left Behind — His Eternal Legacy`,
    titleAr: `ما تركه النبي ﷺ — إرثه الخالد`,
    year: `Eternal`,
    content: `The Prophet Muhammad ﷺ died on Monday, the 12th of Rabi' al-Awwal, 11 AH, in the room of his beloved wife 'Aishah, with his head in her lap, at the age of sixty-three. He left behind what the scholars of Islam have described as a complete civilisation — not merely a religion but a comprehensive way of life that addressed every dimension of human existence.

WHAT HE MATERIALLY LEFT: Almost nothing. He had no accumulated wealth. His armour was mortgaged to a Jewish man in Madinah for thirty measures of barley at the time of his death. His household had no food stored — they had gone months without cooking in his house. He had declared that prophets leave no inheritance — what they leave is taken as sadaqah (charity). His material poverty was by deliberate choice — a man who had defeated empires sleeping on a mat in a mud-brick room.

WHAT HE SPIRITUALLY LEFT: Everything. The Quran — preserved in the hearts of thousands of his companions and on written pages, in exactly the form in which it descended. The Sunnah — his teachings, his practices, his judicial decisions, his personal conduct — preserved through the most sophisticated oral transmission system in pre-modern history, eventually compiled in the books of hadith that every Muslim scholar studies. The Islamic jurisprudence derived from these sources — the four great schools of fiqh (Hanafi, Maliki, Shafi'i, Hanbali) are all ultimately rooted in the Prophet's ﷺ example.

THE FIVE PILLARS HE ESTABLISHED: Five acts that structure Muslim life: the declaration of faith (shahada), the five daily prayers (salah), the annual almsgiving (zakat), the annual fast of Ramadan (sawm), and the pilgrimage to Makkah (Hajj). These five acts create the rhythm of Muslim life — daily, weekly, monthly, annually, and once in a lifetime. They have been performed, continuously, without interruption, from his lifetime to this moment.

THE COMMUNITIES HE TRANSFORMED: Within one generation of his death, the Arabian Peninsula, Persia, Egypt, Syria, Palestine, North Africa, and parts of Central Asia were Muslim. Within two generations, Spain, Sind (Pakistan), and the Silk Road trade networks were Muslim. The transformation of these peoples was not merely political — their languages, their arts, their philosophy, their science, their social organisation all underwent profound change. The Islamic Golden Age — which produced algebra, optics, medicine, astronomy, philosophy, and geography — was built by communities shaped by the Prophet's ﷺ emphasis on learning, justice, and the dignification of reason.

THE WORLD HE STILL SHAPES: As of the twenty-first century, approximately 1.8 billion people — roughly 24% of humanity — call themselves Muslim. Every one of them traces their faith, through a chain of transmission, to this one man who received the first word in a cave in 610 CE. Every day, five times a day, the adhan goes out over every timezone on earth — the same words that Bilal first called over Madinah. Every year, approximately 2.5 million people gather in Makkah for Hajj, following the exact footsteps of the man who performed the Farewell Pilgrimage in 632 CE.

THE PROPHET'S ﷺ OWN ASSESSMENT: He was asked by his wife 'Aishah about the verse "And We have certainly seen you turning your face toward the heaven" — what he was hoping for when he looked up. He said: "I was hoping for the change of the qiblah toward the Ka'bah." He saw the practical, the immediate. But the Quran said something larger about what he was: "And We have not sent you except as a mercy to the worlds." (21:107). Not to the Arabs. Not to the Muslims. To the worlds — all of creation.

This is the Seerah. This is the story of the most consequential human life ever lived. "Say: if you love Allah, follow me — Allah will love you." (3:31). Fourteen centuries of following have not yet exhausted what he left.`,
  },
];
