import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { BookOpen, Video, FileText, Award, Users, GraduationCap, Monitor, Star, Heart, Trophy, ArrowRight, Play } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.12, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] } }),
};

const Index = () => {
  const { t } = useLanguage();

  return (
    <div className="overflow-hidden">
      {/* ============ SECTION 2 — HERO ============ */}
      <section className="relative min-h-screen flex items-center">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('/images/hero-bg.jpg')`,
            filter: "brightness(0.55)",
          }}
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(160deg, rgba(10,30,20,0.72), rgba(15,49,34,0.55), rgba(10,20,15,0.65))",
          }}
        />
        {/* Islamic geometric pattern overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9973a' fill-opacity='0.06'%3E%3Cpath d='M40 0L80 40L40 80L0 40z'/%3E%3Ccircle cx='40' cy='40' r='8'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="container relative mx-auto px-4 py-28 md:py-36">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left content */}
            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
              {/* Bismillah badge */}
              <div className="mb-8 inline-flex items-center gap-3 rounded-lg px-5 py-3" style={{ background: "rgba(10,20,15,0.55)", borderLeft: "3px solid #c9973a", borderRight: "3px solid #c9973a" }}>
                <span className="font-arabic text-lg text-white" dir="rtl" style={{ textShadow: "0 0 20px rgba(201,153,58,0.4)" }}>
                  بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
                </span>
              </div>

              <h1 className="mb-6 font-heading text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-7xl">
                {t("Master Arabic &", "أتقن العربية و")}
                <span className="block mt-2" style={{ color: "#c9973a" }}>
                  {t("Islamic Knowledge", "العلوم الإسلامية")}
                </span>
              </h1>

              <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl font-body">
                {t(
                  "Join thousands of students learning Quran, Tajweed, Arabic Language and Islamic Sciences — guided by qualified scholars, powered by modern technology.",
                  "انضم إلى آلاف الطلاب الذين يتعلمون القرآن والتجويد واللغة العربية والعلوم الإسلامية — بإرشاد علماء مؤهلين وتقنيات حديثة."
                )}
              </p>

              <div className="flex flex-col gap-4 sm:flex-row mb-10">
                <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-xl px-8 py-6 text-base font-semibold shadow-gold" asChild>
                  <Link to="/register">
                    {t("Begin Your Journey", "ابدأ رحلتك")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 rounded-xl px-8 py-6 text-base font-semibold">
                  <Play className="mr-2 h-4 w-4" />
                  {t("Watch Overview", "شاهد النظرة العامة")}
                </Button>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-6 md:gap-10">
                {[
                  { value: "500+", label: t("Students Enrolled", "طالب مسجل") },
                  { value: "4", label: t("Core Programmes", "برامج أساسية") },
                  { value: "95%", label: t("Success Rate", "نسبة النجاح") },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <div className="text-2xl font-bold text-white md:text-3xl font-heading">{s.value}</div>
                    <div className="text-xs text-white/60 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right — floating cards */}
            <motion.div className="hidden lg:block relative h-[500px]" initial="hidden" animate="visible" variants={fadeUp} custom={2}>
              <div className="absolute top-0 right-0 w-72 h-48 rounded-2xl overflow-hidden shadow-2xl rotate-3 border-2 border-white/10">
                <img src="https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600&q=80" alt="Mosque" className="w-full h-full object-cover" />
              </div>
              <div className="absolute top-40 right-24 w-64 h-44 rounded-2xl overflow-hidden shadow-2xl -rotate-2 border-2 border-white/10">
                <img src="https://images.unsplash.com/photo-1585036156171-384164a8c675?w=600&q=80" alt="Quran study" className="w-full h-full object-cover" />
              </div>
              <div className="absolute top-72 right-4 w-60 h-40 rounded-2xl overflow-hidden shadow-2xl rotate-1 border-2 border-white/10">
                <img src="https://images.unsplash.com/photo-1581351123004-757df051db8b?w=600&q=80" alt="Arabic calligraphy" className="w-full h-full object-cover" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 3 — FEATURES STRIP ============ */}
      <section className="bg-primary">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Video, en: "Live Classes", ar: "حصص مباشرة" },
              { icon: Monitor, en: "Recorded Sessions", ar: "جلسات مسجلة" },
              { icon: FileText, en: "Exams & Tests", ar: "اختبارات وتمرينات" },
              { icon: Award, en: "Certified Results", ar: "شهادات معتمدة" },
            ].map((f, i) => (
              <motion.div key={i} className="flex flex-col items-center gap-2 py-4 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <f.icon className="h-7 w-7 text-gold" />
                <span className="text-sm font-semibold text-primary-foreground">{t(f.en, f.ar)}</span>
                <span className="text-xs text-primary-foreground/50 font-arabic" dir="rtl">{f.ar}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 4 — WHY TAHLEEM (ISLAMIC) ============ */}
      <section className="bg-background">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center mb-14">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
              <p className="text-sm font-arabic text-gold mb-3" dir="rtl">
                وَفَوْقَ كُلِّ ذِي عِلْمٍ عَلِيمٌ · Above Every Knower Is One More Knowing
              </p>
              <h2 className="font-heading text-3xl font-bold md:text-4xl text-foreground gold-underline">
                {t("Seeking Knowledge Is An Act of Worship", "طلب العلم عبادة")}
              </h2>
            </motion.div>
            <motion.p className="mt-8 text-muted-foreground max-w-3xl mx-auto leading-relaxed font-body" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}>
              {t(
                'The Prophet ﷺ said: "Seeking knowledge is an obligation upon every Muslim." At Tahleem Academy, we honour this sacred duty — nurturing every student\'s mind, heart and soul through authentic Islamic education passed down from the scholars of our Ummah.',
                'قال النبي ﷺ: "طلب العلم فريضة على كل مسلم." في أكاديمية تعليم، نحترم هذا الواجب المقدس — نغذي عقل كل طالب وقلبه وروحه من خلال التعليم الإسلامي الأصيل المتوارث عن علماء أمتنا.'
              )}
            </motion.p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                img: "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600&q=80",
                icon: "📖",
                titleAr: "القرآن الكريم",
                titleEn: "Quran & Tajweed",
                desc: t(
                  "The Quran is the speech of Allah ﷻ. Learn to recite it beautifully with correct Tajweed from certified Huffadh who have memorised the Book of Allah.",
                  "القرآن كلام الله ﷻ. تعلم تلاوته بأحكام التجويد الصحيحة من حفاظ مجازين حفظوا كتاب الله."
                ),
              },
              {
                img: "https://images.unsplash.com/photo-1564769625905-50e93615e769?w=600&q=80",
                icon: "🕌",
                titleAr: "العلوم الإسلامية",
                titleEn: "Islamic Sciences",
                desc: t(
                  "Deepen your Iman through Fiqh, Aqeedah, Seerah and Hadith — knowledge grounded in the Quran and Sunnah of the Prophet ﷺ.",
                  "عمّق إيمانك من خلال الفقه والعقيدة والسيرة والحديث — علم مبني على القرآن وسنة النبي ﷺ."
                ),
              },
              {
                img: "https://images.unsplash.com/photo-1581351123004-757df051db8b?w=600&q=80",
                icon: "✍️",
                titleAr: "اللغة العربية",
                titleEn: "Arabic Language",
                desc: t(
                  "Arabic is the language of the Quran. From the first letter to full fluency — reading, writing, Nahw and Sarf taught by passionate native scholars.",
                  "العربية لغة القرآن. من الحرف الأول إلى الطلاقة الكاملة — القراءة والكتابة والنحو والصرف على يد علماء متحمسين."
                ),
              },
            ].map((card, i) => (
              <motion.div key={i} className="group rounded-2xl overflow-hidden border border-border bg-card shadow-premium card-premium" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <div className="h-48 overflow-hidden">
                  <img src={card.img} alt={card.titleEn} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                </div>
                <div className="p-6">
                  <div className="text-3xl mb-3">{card.icon}</div>
                  <h3 className="font-heading text-lg font-bold text-foreground">
                    <span className="font-arabic text-gold" dir="rtl">{card.titleAr}</span> — {card.titleEn}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground font-body">{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 5 — COURSES ============ */}
      <section className="bg-cream">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center mb-14">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
              <span className="inline-block text-sm font-semibold text-gold uppercase tracking-wider mb-3">{t("Our Programs", "برامجنا")}</span>
              <h2 className="font-heading text-3xl font-bold md:text-4xl text-foreground gold-underline">
                {t("Explore Our Courses", "استكشف دوراتنا")}
              </h2>
              <p className="mt-6 text-muted-foreground max-w-2xl mx-auto font-body">
                {t(
                  "Each course is carefully structured with live sessions, assignments, and certified exams.",
                  "كل دورة مصممة بعناية مع حصص مباشرة وواجبات واختبارات معتمدة."
                )}
              </p>
            </motion.div>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                img: "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=600&q=80",
                badge: t("Most Popular", "الأكثر طلباً"),
                badgeColor: "bg-gold text-gold-foreground",
                titleAr: "القرآن والتجويد",
                titleEn: "Quran & Tajweed",
                desc: t("Perfect your recitation with certified Huffadh — from beginner Qaida to advanced Tajweed rules.", "أتقن تلاوتك مع حفاظ مجازين — من قاعدة المبتدئين إلى أحكام التجويد المتقدمة."),
                level: t("⭐ All Levels", "⭐ جميع المستويات"),
              },
              {
                img: "https://images.unsplash.com/photo-1581351123004-757df051db8b?w=600&q=80",
                badge: t("New", "جديد"),
                badgeColor: "bg-emerald text-primary-foreground",
                titleAr: "اللغة العربية",
                titleEn: "Arabic Language",
                desc: t("From beginner to advanced — reading, writing, grammar and spoken Arabic.", "من المبتدئ إلى المتقدم — القراءة والكتابة والقواعد والعربية المحكية."),
                level: t("⭐ Beginner Friendly", "⭐ مناسب للمبتدئين"),
              },
              {
                img: "https://images.unsplash.com/photo-1564769625905-50e93615e769?w=600&q=80",
                badge: t("Certified", "معتمد"),
                badgeColor: "bg-secondary text-secondary-foreground",
                titleAr: "العلوم الإسلامية",
                titleEn: "Islamic Sciences",
                desc: t("Fiqh, Aqeedah, Seerah — comprehensive Islamic education with qualified scholars.", "الفقه والعقيدة والسيرة — تعليم إسلامي شامل مع علماء مؤهلين."),
                level: t("⭐ Intermediate", "⭐ متوسط"),
              },
            ].map((course, i) => (
              <motion.div key={i} className="rounded-2xl overflow-hidden border border-border bg-card shadow-premium card-premium" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <div className="relative h-48 overflow-hidden">
                  <img src={course.img} alt={course.titleEn} className="w-full h-full object-cover" />
                  <span className={`absolute top-3 right-3 ${course.badgeColor} text-xs font-semibold px-3 py-1 rounded-full`}>
                    {course.badge}
                  </span>
                </div>
                <div className="p-6">
                  <p className="text-sm font-arabic text-gold mb-1" dir="rtl">{course.titleAr}</p>
                  <h3 className="font-heading text-xl font-bold text-foreground">{course.titleEn}</h3>
                  <p className="mt-2 text-sm text-muted-foreground font-body leading-relaxed">{course.desc}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{course.level}</span>
                    <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-lg font-semibold shadow-gold" asChild>
                      <Link to="/register">{t("Enrol Now", "سجل الآن")}</Link>
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 6 — STATS ============ */}
      <section className="relative bg-primary geometric-pattern">
        <div className="absolute inset-0 bg-primary/90" />
        <div className="container relative mx-auto px-4 py-20 text-center">
          <motion.p className="text-lg font-arabic text-gold/80 mb-3" dir="rtl" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            الحمد لله على نعمة العلم
          </motion.p>
          <motion.h2 className="font-heading text-3xl font-bold text-primary-foreground md:text-4xl mb-12" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}>
            {t("Growing Together in Knowledge", "ننمو معاً في العلم")}
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "500+", label: t("Lessons Delivered", "درس تم تقديمه") },
              { value: "3", label: t("Certified Scholars", "علماء مجازون") },
              { value: "95%", label: t("Student Satisfaction", "رضا الطلاب") },
              { value: "4", label: t("Core Programs", "برامج أساسية") },
            ].map((s, i) => (
              <motion.div key={i} className="text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <div className="font-heading text-4xl font-bold text-gold md:text-5xl">{s.value}</div>
                <div className="mt-2 text-sm text-primary-foreground/70">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 7 — WHY TAHLEEM (6 CARDS) ============ */}
      <section className="bg-background">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center mb-14">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
              <span className="inline-block text-sm font-arabic text-gold mb-3" dir="rtl">لماذا أكاديمية التعليم؟</span>
              <h2 className="font-heading text-3xl font-bold md:text-4xl text-foreground gold-underline">
                {t("Why Tahleem Academy?", "لماذا أكاديمية تعليم؟")}
              </h2>
              <p className="mt-6 text-muted-foreground max-w-3xl mx-auto font-body">
                {t(
                  "Dedicated to nurturing the next generation of Muslims through comprehensive Islamic education that combines traditional values with modern teaching excellence.",
                  "مكرسة لرعاية الجيل القادم من المسلمين من خلال تعليم إسلامي شامل يجمع بين القيم التقليدية والتميز التعليمي الحديث."
                )}
              </p>
            </motion.div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "🕌", title: t("Traditional Foundation", "أساس تقليدي"), desc: t("Our curriculum is rooted in authentic Islamic scholarship — the same knowledge passed down through generations of scholars.", "منهجنا متجذر في العلم الإسلامي الأصيل — نفس المعرفة المتوارثة عبر أجيال من العلماء.") },
              { icon: "💻", title: t("Modern Platform", "منصة حديثة"), desc: t("Live classes, recorded sessions, interactive exams and progress tracking — all in one place, accessible anywhere.", "حصص مباشرة وتسجيلات واختبارات تفاعلية وتتبع التقدم — كل شيء في مكان واحد.") },
              { icon: "👨‍🏫", title: t("Qualified Teachers", "معلمون مؤهلون"), desc: t("Learn from certified Islamic scholars and Arabic language specialists who are passionate about your growth.", "تعلم من علماء إسلاميين مجازين ومتخصصين في اللغة العربية شغوفين بنموك.") },
              { icon: "📊", title: t("Track Your Progress", "تابع تقدمك"), desc: t("Detailed transcripts, term results and performance reports help students and parents stay informed at every stage.", "كشوف درجات مفصلة ونتائج فصلية وتقارير أداء تبقي الطلاب وأولياء الأمور على اطلاع.") },
              { icon: "🤲", title: t("Inclusive Community", "مجتمع شامل"), desc: t("Group classes and one-on-one private sessions available — tailored learning for every student's needs and pace.", "حصص جماعية وخصوصية — تعلم مخصص لاحتياجات كل طالب ووتيرته.") },
              { icon: "🏆", title: t("Certified Programmes", "برامج معتمدة"), desc: t("Earn recognised certificates in Arabic Language, Tajweed, Quran Memorisation and Islamic Sciences.", "احصل على شهادات معترف بها في اللغة العربية والتجويد وحفظ القرآن والعلوم الإسلامية.") },
            ].map((card, i) => (
              <motion.div key={i} className="rounded-2xl p-7 bg-cream border border-border shadow-sm hover:shadow-premium transition-all duration-300 hover:border-b-4 hover:border-b-gold" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <div className="text-3xl mb-4">{card.icon}</div>
                <h3 className="font-heading text-lg font-bold text-foreground mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-body">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 8 — CTA ============ */}
      <section className="relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1564769625905-50e93615e769?w=1600&q=80')`,
            filter: "brightness(0.3)",
          }}
        />
        <div className="absolute inset-0 bg-primary/70" />
        <div className="container relative mx-auto px-4 py-24 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            <p className="text-lg font-arabic text-gold/80 mb-4" dir="rtl">
              اطلبوا العلم من المهد إلى اللحد
            </p>
            <h2 className="font-heading text-3xl font-bold text-white md:text-4xl mb-4">
              {t("Begin Your Journey Today", "ابدأ رحلتك اليوم")}
            </h2>
            <p className="text-white/70 max-w-lg mx-auto mb-10 font-body">
              {t(
                "Join Tahleem Academy and take your first step towards mastering Arabic and Islamic knowledge — guided by qualified scholars.",
                "انضم إلى أكاديمية تعليم واتخذ خطوتك الأولى نحو إتقان العربية والعلوم الإسلامية — بإرشاد علماء مؤهلين."
              )}
            </p>
            <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-xl px-10 py-6 text-base font-semibold shadow-gold" asChild>
              <Link to="/register">
                {t("Create Free Account", "إنشاء حساب مجاني")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Index;
