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
    { name: "Abdul Waarith Qasim", text: t("The depth of knowledge at Tahleem Academy is remarkable. The instructors provide a gateway to understanding our Deen more profoundly.", "عمق المعرفة في أكاديمية تعليم مذهل. يوفر المعلمون بوابة لفهم ديننا بشكل أعمق."), role: t("Student", "طالب") },
    { name: "Qudroh Animashaun", text: t("The simplification provided by the instructors made Arabic finally 'click' for me. It's been a transformative experience for my Salah.", "التبسيط الذي قدمه المعلمون جعل العربية أخيرًا 'تنقر' بالنسبة لي. لقد كانت تجربة تحويلية لصلاتي."), role: t("Student", "طالبة") },
    { name: "Ruqayyah Yusuf", text: t("The focus on Tajweed and Riwaayat here is top-tier. My recitation and confidence have improved significantly.", "التركيز على التجويد والروايات هنا من الدرجة الأولى. تحسنت تلاوتي وثقتي بشكل ملحوظ."), role: t("Student", "طالبة") },
    { name: "Zeenat Agoro", text: t("A perfect blend of traditional values and modern convenience. The mission of nurturing the next generation is evident in every lesson.", "مزيج مثالي من القيم التقليدية والراحة الحديثة. مهمة رعاية الجيل القادم واضحة في كل درس."), role: t("Student", "طالبة") },
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

      {/* Why Tahleem Academy */}
      <section className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold">{t("Why Tahleem Academy?", "لماذا أكاديمية تعليم؟")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t(
              "Dedicated to nurturing the next generation of Muslims through comprehensive Islamic education that combines traditional values with modern teaching excellence.",
              "مكرسة لرعاية الجيل القادم من المسلمين من خلال تعليم إسلامي شامل يجمع بين القيم التقليدية والتميز التعليمي الحديث."
            )}
          </p>
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
            { value: "20+", label: t("Students", "طالب") },
            { value: "30+", label: t("Exams Taken", "امتحان") },
            { value: "95%+", label: t("Satisfaction", "رضا") },
            { value: "3", label: t("Expert Instructors", "معلمون خبراء") },
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
            {t("Join our growing community of students mastering Arabic today.", "انضم إلى مجتمعنا المتنامي من الطلاب الذين يتقنون العربية اليوم.")}
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
