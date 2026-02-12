import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Award, Users, ArrowRight, Star, CheckCircle2, Globe, Mic } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.12, duration: 0.6, ease: [0, 0, 0.2, 1] as const } }),
};

const Index = () => {
  const { t } = useLanguage();

  const features = [
    { icon: BookOpen, title: t("Arabic Language", "اللغة العربية"), desc: t("Master modern and classical Arabic with expert instructors", "أتقن اللغة العربية الحديثة والكلاسيكية مع مدرسين خبراء") },
    { icon: GraduationCap, title: t("Tajweed", "التجويد"), desc: t("Perfect your Quran recitation with proper pronunciation rules", "أتقن تلاوة القرآن مع أحكام النطق الصحيح") },
    { icon: Award, title: t("Certified Exams", "اختبارات معتمدة"), desc: t("Take proctored exams and earn certificates of achievement", "اجتز اختبارات مراقبة واحصل على شهادات إنجاز") },
    { icon: Users, title: t("Expert Teachers", "معلمون خبراء"), desc: t("Learn from qualified scholars and native Arabic speakers", "تعلم من علماء مؤهلين ومتحدثين أصليين") },
  ];

  const testimonials = [
    { name: "Abdul Waarith Qasim", text: t("The depth of knowledge at Tahleem Academy is remarkable. The instructors provide a gateway to understanding our Deen more profoundly.", "عمق المعرفة في أكاديمية تعليم مذهل. يوفر المعلمون بوابة لفهم ديننا بشكل أعمق."), role: t("Student", "طالب"), initials: "AW" },
    { name: "Qudroh Animashaun", text: t("The simplification provided by the instructors made Arabic finally 'click' for me. It's been a transformative experience for my Salah.", "التبسيط الذي قدمه المعلمون جعل العربية أخيرًا 'تنقر' بالنسبة لي. لقد كانت تجربة تحويلية لصلاتي."), role: t("Student", "طالبة"), initials: "QA" },
    { name: "Ruqayyah Yusuf", text: t("The focus on Tajweed and Riwaayat here is top-tier. My recitation and confidence have improved significantly.", "التركيز على التجويد والروايات هنا من الدرجة الأولى. تحسنت تلاوتي وثقتي بشكل ملحوظ."), role: t("Student", "طالبة"), initials: "RY" },
    { name: "Zeenat Agoro", text: t("A perfect blend of traditional values and modern convenience. The mission of nurturing the next generation is evident in every lesson.", "مزيج مثالي من القيم التقليدية والراحة الحديثة. مهمة رعاية الجيل القادم واضحة في كل درس."), role: t("Student", "طالبة"), initials: "ZA" },
  ];

  const highlights = [
    t("Structured curriculum designed by scholars", "منهج منظم صممه علماء"),
    t("Proctored online examinations", "اختبارات مراقبة عبر الإنترنت"),
    t("Bilingual learning (Arabic & English)", "تعلم ثنائي اللغة"),
    t("Certificates upon completion", "شهادات عند الإكمال"),
  ];

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative geometric-pattern">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-mid to-primary" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M60 0L120 60L60 120L0 60z'/%3E%3Ccircle cx='60' cy='60' r='15' fill='none' stroke='%23ffffff' stroke-width='1'/%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="container relative mx-auto px-4 py-28 md:py-40">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
          >
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-5 py-2 text-sm font-medium text-gold backdrop-blur-sm">
              <span className="text-gold">✦</span>
              {t("Arabic Learning Excellence", "التميز في تعلم العربية")}
              <span className="text-gold">✦</span>
            </div>
            <h1 className="mb-6 font-display text-5xl font-bold leading-[1.1] tracking-tight text-primary-foreground md:text-7xl">
              {t("Master Arabic with", "أتقن العربية مع")}
              <span className="block mt-3 text-gold font-arabic">
                {t("Tahleem Academy", "أكاديمية تعليم")}
              </span>
            </h1>
            <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-primary-foreground/75 md:text-xl">
              {t(
                "Structured courses, certified exams, and expert guidance — your complete platform for Arabic learning.",
                "دورات منظمة واختبارات معتمدة وإرشاد متخصص — منصتك الكاملة لتعلم العربية."
              )}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-xl px-8 py-6 text-base font-semibold shadow-gold transition-all duration-300 hover:scale-[1.03]" asChild>
                <Link to="/register">
                  {t("Start Learning", "ابدأ التعلم")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 rounded-xl px-8 py-6 text-base transition-all duration-300" asChild>
                <Link to="/courses">{t("Browse Courses", "تصفح الدورات")}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
        {/* Bottom curve */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 60L1440 60L1440 0C1440 0 1080 60 720 60C360 60 0 0 0 0L0 60Z" fill="hsl(var(--background))" />
          </svg>
        </div>
      </section>

      {/* Highlights strip */}
      <section className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-gold" />
                {h}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Tahleem Academy */}
      <section className="container mx-auto px-4 py-24">
        <div className="mb-14 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            <h2 className="mb-3 font-display text-3xl font-bold md:text-4xl gold-underline">
              {t("Why Tahleem Academy?", "لماذا أكاديمية تعليم؟")}
            </h2>
          </motion.div>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1} className="mt-6 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t(
              "Dedicated to nurturing the next generation of Muslims through comprehensive Islamic education that combines traditional values with modern teaching excellence.",
              "مكرسة لرعاية الجيل القادم من المسلمين من خلال تعليم إسلامي شامل يجمع بين القيم التقليدية والتميز التعليمي الحديث."
            )}
          </motion.p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <Card className="card-premium h-full border border-border/50 bg-card shadow-premium rounded-2xl">
                <CardContent className="p-7">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                    <f.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Gold divider */}
      <div className="container mx-auto px-4">
        <div className="gold-divider" />
      </div>

      {/* Stats */}
      <section className="bg-primary geometric-pattern relative">
        <div className="absolute inset-0 bg-primary/95" />
        <div className="container relative mx-auto grid grid-cols-2 gap-8 px-4 py-20 md:grid-cols-4">
          {[
            { value: "20+", label: t("Students", "طالب"), icon: Users },
            { value: "30+", label: t("Exams Taken", "امتحان"), icon: Award },
            { value: "95%+", label: t("Satisfaction", "رضا"), icon: Star },
            { value: "3", label: t("Expert Instructors", "معلمون خبراء"), icon: GraduationCap },
          ].map((s, i) => (
            <motion.div key={i} className="text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <s.icon className="mx-auto mb-3 h-7 w-7 text-gold" />
              <div className="font-display text-4xl font-bold text-primary-foreground md:text-5xl">{s.value}</div>
              <div className="mt-2 text-sm font-medium text-primary-foreground/70">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-accent/30">
        <div className="container mx-auto px-4 py-24">
          <div className="mb-14 text-center">
            <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="font-display text-3xl font-bold md:text-4xl gold-underline">
              {t("What Our Students Say", "ماذا يقول طلابنا")}
            </motion.h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((tm, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <Card className="card-premium h-full rounded-2xl border border-border/50 shadow-premium">
                  <CardContent className="p-7">
                    <div className="mb-4 flex gap-1">
                      {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-gold text-gold" />)}
                    </div>
                    <p className="mb-6 text-sm leading-relaxed text-muted-foreground italic">"{tm.text}"</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {tm.initials}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{tm.name}</div>
                        <div className="text-xs text-muted-foreground">{tm.role}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative geometric-pattern">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-mid to-primary" />
        <div className="container relative mx-auto px-4 py-24 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            <div className="ornament-divider mb-8">
              <span className="text-2xl text-gold">✦</span>
            </div>
            <h2 className="mb-4 font-display text-3xl font-bold text-primary-foreground md:text-4xl">
              {t("Ready to Begin Your Journey?", "مستعد لبدء رحلتك؟")}
            </h2>
            <p className="mb-10 text-primary-foreground/70 max-w-lg mx-auto">
              {t("Join our growing community of students mastering Arabic today.", "انضم إلى مجتمعنا المتنامي من الطلاب الذين يتقنون العربية اليوم.")}
            </p>
            <Button size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90 rounded-xl px-10 py-6 text-base font-semibold shadow-gold transition-all duration-300 hover:scale-[1.03]" asChild>
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
