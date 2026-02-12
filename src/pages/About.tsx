import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Heart, Target, Eye, GraduationCap, CheckCircle } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

const About = () => {
  const { t } = useLanguage();

  const instructors = [
    {
      name: t("Ustadh Mustapha (Abu Yazeed)", "الأستاذ مصطفى (أبو يزيد)"),
      role: t("Foundations & Arabic Specialist", "متخصص في الأساسيات واللغة العربية"),
      points: [
        t("Possesses a strong and disciplined foundation in classical Arabic studies.", "يمتلك أساسًا قويًا ومنضبطًا في الدراسات العربية الكلاسيكية."),
        t("Specializes in building essential linguistic skills through structured, traditional methodologies.", "متخصص في بناء المهارات اللغوية الأساسية من خلال منهجيات تقليدية منظمة."),
        t("Passionate about nurturing clarity, precision, and confidence in students from the foundational level upward.", "شغوف برعاية الوضوح والدقة والثقة لدى الطلاب من المستوى التأسيسي فصاعدًا."),
      ],
    },
    {
      name: t("Ustadh Muhyidden (Abu Zineerah)", "الأستاذ محي الدين (أبو زنيرة)"),
      role: t("General Arabic & Conceptual Clarification", "اللغة العربية العامة والتوضيح المفاهيمي"),
      points: [
        t("Specialist in General Arabic with exceptional ability in simplifying complex subjects.", "متخصص في اللغة العربية العامة مع قدرة استثنائية في تبسيط المواضيع المعقدة."),
        t("Breaks down intricate Islamic and linguistic concepts into clear, practical understanding.", "يفكك المفاهيم الإسلامية واللغوية المعقدة إلى فهم واضح وعملي."),
        t("Ensures learners of all levels grasp both meaning and application effectively.", "يضمن أن المتعلمين من جميع المستويات يفهمون المعنى والتطبيق بفعالية."),
      ],
    },
    {
      name: t("Ustadh Yusuf (Al-Fawāiz)", "الأستاذ يوسف (الفوائز)"),
      role: t("Qur'anic Sciences & Tajwīd", "العلوم القرآنية والتجويد"),
      points: [
        t("Specializes in Qur'anic recitation and the science of Tajwīd.", "متخصص في تلاوة القرآن وعلم التجويد."),
        t("Skilled in teaching the various Riwāyāt (Qur'anic narrations) with precision and authenticity.", "ماهر في تدريس الروايات القرآنية المختلفة بدقة وأصالة."),
        t("Dedicated to cultivating excellence in recitation, accuracy, and spiritual connection to the Qur'an.", "مكرس لتنمية التميز في التلاوة والدقة والارتباط الروحي بالقرآن."),
      ],
    },
  ];

  const values = [
    t("Excellence in Islamic scholarship", "التميز في العلوم الإسلامية"),
    t("Compassion and respect for all", "الرحمة والاحترام للجميع"),
    t("Integrity and authenticity", "النزاهة والأصالة"),
    t("Continuous learning and growth", "التعلم المستمر والنمو"),
    t("Community and collaboration", "المجتمع والتعاون"),
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
              "Dedicated to nurturing the next generation of Muslims through comprehensive Islamic education that combines traditional values with modern teaching excellence.",
              "مكرسة لرعاية الجيل القادم من المسلمين من خلال تعليم إسلامي شامل يجمع بين القيم التقليدية والتميز التعليمي الحديث."
            )}
          </motion.p>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            <Card className="h-full border-none bg-card shadow-sm">
              <CardContent className="p-6 text-center">
                <Target className="mx-auto mb-4 h-10 w-10 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">{t("Our Mission", "مهمتنا")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "To provide comprehensive Islamic education that nurtures spiritual growth, academic excellence, and moral character, preparing students to be confident, practicing Muslims who contribute positively to society.",
                    "تقديم تعليم إسلامي شامل يرعى النمو الروحي والتميز الأكاديمي والشخصية الأخلاقية، وإعداد الطلاب ليكونوا مسلمين واثقين وممارسين يساهمون إيجابيًا في المجتمع."
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}>
            <Card className="h-full border-none bg-card shadow-sm">
              <CardContent className="p-6 text-center">
                <Eye className="mx-auto mb-4 h-10 w-10 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">{t("Our Vision", "رؤيتنا")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "To be a leading institution in Islamic education, recognized for excellence in teaching, innovation in methodology, and dedication to developing well-rounded individuals who embody Islamic values in all aspects of life.",
                    "أن نكون مؤسسة رائدة في التعليم الإسلامي، معروفة بالتميز في التدريس والابتكار في المنهجية والتفاني في تطوير أفراد متكاملين يجسدون القيم الإسلامية في جميع جوانب الحياة."
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={2}>
            <Card className="h-full border-none bg-card shadow-sm">
              <CardContent className="p-6 text-center">
                <Heart className="mx-auto mb-4 h-10 w-10 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">{t("Our Values", "قيمنا")}</h3>
                <ul className="text-sm text-muted-foreground text-left space-y-2">
                  {values.map((v, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{v}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Instructors */}
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16">
          <h2 className="mb-4 text-center text-3xl font-bold">{t("Meet Our Instructors", "تعرف على معلمينا")}</h2>
          <p className="mb-10 text-center text-muted-foreground max-w-2xl mx-auto">
            {t(
              "Our instructors combine authentic Islamic knowledge with clear and structured teaching.",
              "يجمع معلمونا بين المعرفة الإسلامية الأصيلة والتدريس الواضح والمنظم."
            )}
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {instructors.map((inst, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}>
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                      <GraduationCap className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-center">{inst.name}</h3>
                    <p className="mb-4 text-sm text-primary font-medium text-center">{inst.role}</p>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      {inst.points.map((p, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Why Learn With Our Instructors */}
          <motion.div
            className="mt-12 max-w-3xl mx-auto text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0}
          >
            <Card className="border-none bg-accent/50">
              <CardContent className="p-8">
                <h3 className="mb-4 text-xl font-semibold">
                  {t("Why Learn With Our Instructors?", "لماذا تتعلم مع معلمينا؟")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t(
                    "Our instructors combine authentic Islamic knowledge with clear and structured teaching. They teach according to the Qur'an and Sunnah, while ensuring that every lesson is easy to understand and practical to apply.",
                    "يجمع معلمونا بين المعرفة الإسلامية الأصيلة والتدريس الواضح والمنظم. يعلمون وفقًا للقرآن والسنة، مع ضمان أن كل درس سهل الفهم وعملي التطبيق."
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Students learn in an environment that nurtures good character, strengthens faith, and supports steady academic progress — helping them grow in both knowledge and īmān.",
                    "يتعلم الطلاب في بيئة تنمي الأخلاق الحسنة وتقوي الإيمان وتدعم التقدم الأكاديمي المستمر — مما يساعدهم على النمو في المعرفة والإيمان معًا."
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default About;
