import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Heart, Target, Eye, GraduationCap } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

const About = () => {
  const { t } = useLanguage();

  const instructors = [
    { name: t("Dr. Ahmad Al-Rashidi", "د. أحمد الرشيدي"), role: t("Head of Arabic Studies", "رئيس قسم الدراسات العربية"), bio: t("PhD in Arabic Linguistics with 15 years of teaching experience.", "دكتوراه في اللغويات العربية مع 15 سنة خبرة في التدريس.") },
    { name: t("Ustadha Maryam Khalil", "الأستاذة مريم خليل"), role: t("Tajweed Specialist", "متخصصة في التجويد"), bio: t("Ijazah holder in multiple Qira'at with expertise in Tajweed.", "حاملة إجازة في عدة قراءات مع خبرة في التجويد.") },
    { name: t("Sheikh Yusuf Ibrahim", "الشيخ يوسف إبراهيم"), role: t("Quran Memorization Director", "مدير برنامج حفظ القرآن"), bio: t("Hafiz of Quran with 20 years guiding students through Hifz.", "حافظ للقرآن مع 20 سنة في توجيه الطلاب خلال الحفظ.") },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="bg-accent geometric-pattern">
        <div className="container mx-auto px-4 py-20 text-center">
          <motion.h1 className="mb-4 text-4xl font-bold" initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            {t("About Tahleem Academy", "عن أكاديمية تعليم")}
          </motion.h1>
          <motion.p className="mx-auto max-w-2xl text-muted-foreground" initial="hidden" animate="visible" variants={fadeUp} custom={1}>
            {t(
              "Tahleem Academy is dedicated to making Arabic education accessible, structured, and rewarding for students worldwide.",
              "أكاديمية تعليم مكرسة لجعل تعليم اللغة العربية متاحًا ومنظمًا ومجزيًا للطلاب حول العالم."
            )}
          </motion.p>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { icon: Target, title: t("Our Mission", "مهمتنا"), desc: t("To provide world-class Arabic education through innovative teaching methods and technology-driven assessments.", "تقديم تعليم عربي عالمي المستوى من خلال أساليب تدريس مبتكرة وتقييمات تعتمد على التكنولوجيا.") },
            { icon: Eye, title: t("Our Vision", "رؤيتنا"), desc: t("To become the leading online platform for Arabic language learning and Quranic studies globally.", "أن نصبح المنصة الرائدة عبر الإنترنت لتعلم اللغة العربية والدراسات القرآنية عالميًا.") },
            { icon: Heart, title: t("Our Values", "قيمنا"), desc: t("Excellence in education, respect for tradition, innovation in methodology, and dedication to every student's success.", "التميز في التعليم واحترام التقاليد والابتكار في المنهجية والتفاني في نجاح كل طالب.") },
          ].map((item, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
              <Card className="h-full border-none bg-card shadow-sm">
                <CardContent className="p-6 text-center">
                  <item.icon className="mx-auto mb-4 h-10 w-10 text-primary" />
                  <h3 className="mb-2 text-xl font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Instructors */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16">
          <h2 className="mb-10 text-center text-3xl font-bold">{t("Our Instructors", "معلمونا")}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {instructors.map((inst, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <Card className="h-full">
                  <CardContent className="p-6 text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                      <GraduationCap className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold">{inst.name}</h3>
                    <p className="mb-2 text-sm text-secondary font-medium">{inst.role}</p>
                    <p className="text-sm text-muted-foreground">{inst.bio}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
