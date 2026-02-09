import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Award, Users, ArrowRight, Star } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
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
    { name: t("Sarah Ahmed", "سارة أحمد"), text: t("Tahleem Academy transformed my understanding of Arabic. The structured courses and exams helped me progress rapidly.", "غيّرت أكاديمية تعليم فهمي للعربية. ساعدتني الدورات والامتحانات المنظمة على التقدم بسرعة."), role: t("Student", "طالبة") },
    { name: t("Omar Hassan", "عمر حسن"), text: t("The exam portal is incredible. Immediate feedback and detailed analytics helped me identify and improve my weak areas.", "بوابة الامتحانات رائعة. ساعدتني التغذية الراجعة الفورية والتحليلات على تحديد نقاط ضعفي وتحسينها."), role: t("Student", "طالب") },
    { name: t("Fatima Ali", "فاطمة علي"), text: t("As a teacher, I love the comprehensive tools for creating exams and tracking student progress effortlessly.", "كمعلمة، أحب الأدوات الشاملة لإنشاء الامتحانات وتتبع تقدم الطلاب بسهولة."), role: t("Teacher", "معلمة") },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden geometric-pattern">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="container relative mx-auto px-4 py-24 md:py-32">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
          >
            <div className="mb-6 inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
              ✦ {t("Arabic Learning Excellence", "التميز في تعلم العربية")} ✦
            </div>
            <h1 className="mb-6 text-4xl font-bold leading-tight md:text-6xl">
              {t("Master Arabic with", "أتقن العربية مع")}
              <span className="block text-primary font-arabic mt-2">
                {t("Tahleem Academy", "أكاديمية تعليم")}
              </span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl">
              {t(
                "Structured courses, certified exams, and expert guidance — your complete platform for Arabic learning.",
                "دورات منظمة واختبارات معتمدة وإرشاد متخصص — منصتك الكاملة لتعلم العربية."
              )}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/register">
                  {t("Start Learning", "ابدأ التعلم")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/courses">{t("Browse Courses", "تصفح الدورات")}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold">{t("Why Tahleem Academy?", "لماذا أكاديمية تعليم؟")}</h2>
          <p className="text-muted-foreground">{t("Everything you need to excel in Arabic", "كل ما تحتاجه للتفوق في العربية")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <Card className="h-full border-none bg-accent/50 shadow-none hover:bg-accent transition-colors">
                <CardContent className="p-6">
                  <f.icon className="mb-4 h-10 w-10 text-primary" />
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="bg-primary text-primary-foreground">
        <div className="container mx-auto grid grid-cols-2 gap-8 px-4 py-16 md:grid-cols-4">
          {[
            { value: "500+", label: t("Students", "طالب") },
            { value: "50+", label: t("Courses", "دورة") },
            { value: "1000+", label: t("Exams Taken", "امتحان") },
            { value: "98%", label: t("Satisfaction", "رضا") },
          ].map((s, i) => (
            <motion.div key={i} className="text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <div className="text-3xl font-bold md:text-4xl">{s.value}</div>
              <div className="mt-1 text-sm opacity-80">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold">{t("What Our Students Say", "ماذا يقول طلابنا")}</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((tm, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="mb-3 flex gap-1">
                    {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-secondary text-secondary" />)}
                  </div>
                  <p className="mb-4 text-sm text-muted-foreground italic">"{tm.text}"</p>
                  <div className="font-semibold">{tm.name}</div>
                  <div className="text-xs text-muted-foreground">{tm.role}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-accent geometric-pattern">
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="mb-4 text-3xl font-bold">{t("Ready to Begin?", "مستعد للبدء؟")}</h2>
          <p className="mb-8 text-muted-foreground">
            {t("Join hundreds of students mastering Arabic today.", "انضم إلى مئات الطلاب الذين يتقنون العربية اليوم.")}
          </p>
          <Button size="lg" asChild>
            <Link to="/register">
              {t("Create Free Account", "إنشاء حساب مجاني")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
