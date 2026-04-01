import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  BookOpen, Users, Star, GraduationCap, Mic, Video,
  CheckCircle, ArrowRight, Clock, Shield, BookMarked,
  ChevronRight,
} from "lucide-react";

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5 },
  }),
};

const STATS = [
  { icon: <Users className="h-8 w-8 text-primary" />, value: "500+", label: "Students Enrolled" },
  { icon: <Star className="h-8 w-8 text-primary" />, value: "4.9", label: "Average Rating" },
  { icon: <Clock className="h-8 w-8 text-primary" />, value: "3 yrs", label: "Years of Excellence" },
  { icon: <GraduationCap className="h-8 w-8 text-primary" />, value: "3", label: "Programmes" },
];

const FEATURES = [
  {
    icon: <BookOpen className="h-8 w-8 text-primary" />,
    title: "Structured Curriculum",
    titleAr: "منهج منظم",
    desc: "From Noorani Qaida to advanced Tajweed — every level follows a carefully designed Islamic education pathway.",
    descAr: "من نوراني قاعدة إلى التجويد المتقدم — كل مستوى يتبع مسار تعليمي إسلامي مصمم بعناية.",
  },
  {
    icon: <Mic className="h-8 w-8 text-primary" />,
    title: "Live Recitation Feedback",
    titleAr: "تغذية راجعة للتلاوة",
    desc: "AI-assisted and teacher-reviewed recitation assessments give you real-time corrections on your Tajweed.",
    descAr: "تقييمات التلاوة بمساعدة الذكاء الاصطناعي تمنحك تصحيحات فورية لتجويدك.",
  },
  {
    icon: <Video className="h-8 w-8 text-primary" />,
    title: "Live Interactive Classes",
    titleAr: "دروس تفاعلية مباشرة",
    desc: "Attend scheduled live sessions with qualified ustadhs via our built-in virtual classroom.",
    descAr: "احضر جلسات مباشرة مجدولة مع الأساتذة المؤهلين عبر فصلنا الافتراضي المدمج.",
  },
  {
    icon: <GraduationCap className="h-8 w-8 text-primary" />,
    title: "Certified Instructors",
    titleAr: "معلمون معتمدون",
    desc: "Learn from verified scholars with ijazah chains, combining authentic knowledge with modern pedagogy.",
    descAr: "تعلم من علماء متحققين بسلاسل إجازة، يجمعون بين المعرفة الأصيلة والتربية الحديثة.",
  },
  {
    icon: <BookMarked className="h-8 w-8 text-primary" />,
    title: "Al-Hifdh Centre",
    titleAr: "مركز الحفظ",
    desc: "A dedicated Quran memorisation module with spaced-repetition, audio playback, and progress tracking.",
    descAr: "وحدة حفظ قرآن مخصصة مع التكرار المتباعد وتشغيل الصوت وتتبع التقدم.",
  },
  {
    icon: <Shield className="h-8 w-8 text-primary" />,
    title: "Secure & Proctored Exams",
    titleAr: "اختبارات آمنة ومراقبة",
    desc: "Tamper-resistant online exams with live proctoring — your academic integrity is always protected.",
    descAr: "اختبارات إلكترونية محمية من التلاعب مع مراقبة مباشرة — تكاملك الأكاديمي محمي دائما.",
  },
];

const PROGRAMMES = [
  {
    level: "Beginner",
    levelAr: "المبتدئ",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    price: "5,000",
    items: ["Noorani Qaida", "Basic Tajweed", "Arabic Alphabet", "Foundational Islamic Studies"],
  },
  {
    level: "Intermediate",
    levelAr: "المتوسط",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    price: "6,000",
    badge: "Most Popular",
    items: ["Full Tajweed Rules", "Surah Memorisation", "Arabic Grammar Basics", "Fiqh & Aqeedah"],
  },
  {
    level: "Advanced",
    levelAr: "المتقدم",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    price: "7,000",
    items: ["Advanced Tajweed & Qiraat", "Full Hifdh Programme", "Advanced Arabic", "Tafseer & Hadith Sciences"],
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Register & Pay", titleAr: "سجّل وادفع", desc: "Create your account and pay the one-time NGN 5,000 registration fee." },
  { step: "02", title: "Entrance Exam", titleAr: "اختبار القبول", desc: "Take our online written and recitation entrance assessment." },
  { step: "03", title: "Level Assignment", titleAr: "تحديد المستوى", desc: "An ustadh reviews your recitation and assigns your learning level." },
  { step: "04", title: "Start Learning", titleAr: "ابدأ التعلم", desc: "Access live classes, materials, and the Al-Hifdh Centre." },
];

const Index = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div>

      {/* HERO */}
      <section className="bg-primary geometric-pattern">
        <div className="container mx-auto px-4 py-24 text-center">

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="mb-4"
          >
            <Badge variant="secondary" className="text-sm px-4 py-1">
              {t("Nigeria's Leading Islamic E-Learning Platform", "منصة التعلم الإسلامي الرائدة في نيجيريا")}
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-4 text-4xl font-bold text-primary-foreground md:text-5xl lg:text-6xl"
          >
            {t("Learn Qur'an & Islamic Studies", "تعلّم القرآن والعلوم الإسلامية")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mb-2 text-xl text-primary-foreground/80"
            style={{ fontFamily: "serif" }}
          >
            {t("From Authentic Scholars", "مع علماء موثوقين")}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mx-auto mb-10 max-w-2xl text-base text-primary-foreground/75 leading-relaxed"
          >
            {t(
              "Structured programmes in Tajweed, Quran memorisation, Arabic, Fiqh, and Aqeedah — taught live by qualified instructors with weekly sessions, AI recitation feedback, and certified transcripts.",
              "برامج منظمة في التجويد وحفظ القرآن والعربية والفقه والعقيدة — تُدرَّس مباشرة من قبل مدرسين مؤهلين."
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate("/register")}
              className="gap-2 text-base font-bold px-8"
            >
              {t("Enroll Now", "سجّل الآن")} <ArrowRight className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/courses")}
              className="gap-2 text-base border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
            >
              {t("Explore Courses", "استعرض الدورات")} <ChevronRight className="h-5 w-5" />
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-6 text-sm text-primary-foreground/50"
          >
            {t(
              "No hidden fees  -  Certified instructors  -  Cancel anytime",
              "بدون رسوم خفية  -  مدربون معتمدون  -  إلغاء في أي وقت"
            )}
          </motion.p>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-accent">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <Card className="h-full border-none shadow-sm text-center">
                  <CardContent className="p-6">
                    <div className="flex justify-center mb-3">{s.icon}</div>
                    <div className="text-3xl font-bold text-foreground">{s.value}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container mx-auto px-4 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mb-14 text-center"
        >
          <h2 className="mb-3 text-3xl font-bold">
            {t("Why Tahleem Academy?", "لماذا أكاديمية تعليم؟")}
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            {t(
              "A complete Islamic education platform built for serious students — from beginners to advanced scholars.",
              "منصة تعليم إسلامي متكاملة مصممة للطلاب الجادين — من المبتدئين إلى المتقدمين."
            )}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
                    {f.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{t(f.title, f.titleAr)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(f.desc, f.descAr)}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PROGRAMMES */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mb-14 text-center"
          >
            <h2 className="mb-3 text-3xl font-bold">
              {t("Choose Your Level", "اختر مستواك")}
            </h2>
            <p className="mx-auto max-w-md text-muted-foreground">
              {t(
                "Three structured programmes. Your level is assigned after the entrance assessment.",
                "ثلاثة برامج منظمة. يتم تحديد مستواك بعد تقييم القبول."
              )}
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {PROGRAMMES.map((p, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="relative"
              >
                {p.badge && (
                  <div className="absolute -top-3 right-4 z-10">
                    <Badge className="bg-yellow-500 text-white hover:bg-yellow-500 text-xs font-bold px-3 py-1">
                      {p.badge}
                    </Badge>
                  </div>
                )}
                <Card className={`h-full border-2 ${p.border} ${p.bg}`}>
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <span className={`text-xl font-bold ${p.color}`}>{p.level}</span>
                      <span className={`ml-2 text-base ${p.color}`} style={{ fontFamily: "serif" }}>
                        {p.levelAr}
                      </span>
                    </div>
                    <div className="mb-5 text-2xl font-bold text-foreground">
                      {t("NGN " + p.price + " / mo", p.price + " نيرا / شهريا")}
                    </div>
                    <ul className="space-y-2">
                      {p.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <CheckCircle className={"mt-0.5 h-4 w-4 shrink-0 " + p.color} />
                          <span className="text-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mt-10 text-center"
          >
            <Button variant="outline" size="lg" onClick={() => navigate("/pricing")} className="gap-2">
              {t("View Full Pricing", "عرض التسعير الكامل")} <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container mx-auto px-4 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mb-14 text-center"
        >
          <h2 className="mb-3 text-3xl font-bold">
            {t("How Enrolment Works", "كيف يعمل التسجيل")}
          </h2>
          <p className="text-muted-foreground">
            {t(
              "A transparent 4-step process from registration to your first class.",
              "عملية شفافة من 4 خطوات من التسجيل إلى أول درس."
            )}
          </p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((h, i) => (
            <motion.div
              key={i}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold shadow-md">
                {h.step}
              </div>
              <h3 className="mb-2 text-base font-semibold">{t(h.title, h.titleAr)}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{h.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* QUOTE */}
      <section className="bg-accent geometric-pattern">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="container mx-auto px-4 py-16 text-center"
        >
          <blockquote className="mx-auto max-w-2xl text-xl font-medium italic text-foreground">
            {t(
              "\"The best of you are those who learn the Qur'an and teach it.\"",
              "\"خيركم من تعلّم القرآن وعلّمه.\""
            )}
          </blockquote>
          <cite className="mt-4 block text-sm text-muted-foreground not-italic">
            {t(
              "The Prophet (peace be upon him) — Sahih al-Bukhari",
              "النبي صلى الله عليه وسلم — صحيح البخاري"
            )}
          </cite>
        </motion.div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-primary">
        <div className="container mx-auto px-4 py-20 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <GraduationCap className="mx-auto mb-5 h-12 w-12 text-primary-foreground/80" />
            <h2 className="mb-4 text-3xl font-bold text-primary-foreground">
              {t("Begin Your Qur'anic Journey Today", "ابدأ رحلتك القرآنية اليوم")}
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base text-primary-foreground/75 leading-relaxed">
              {t(
                "Join hundreds of students across Nigeria and beyond who are memorising, reciting, and understanding the Qur'an with qualified scholars.",
                "انضم إلى مئات الطلاب في نيجيريا وخارجها الذين يحفظون ويتلون ويفهمون القرآن مع علماء مؤهلين."
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button
                size="lg"
                variant="secondary"
                onClick={() => navigate("/register")}
                className="gap-2 text-base font-bold px-8"
              >
                {t("Register Now", "سجّل الآن")} <ArrowRight className="h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/about")}
                className="gap-2 text-base border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
              >
                {t("Learn About Us", "تعرف علينا")}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
};

export default Index;
