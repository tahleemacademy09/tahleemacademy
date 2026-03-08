import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { BookOpen, Clock, Users } from "lucide-react";
import quranTajweedImg from "@/assets/quran-tajweed.jpeg";
import arabicLanguageImg from "@/assets/arabic-language.jpeg";

const DEMO_COURSES = [
  { id: "1", title: "Foundations of Arabic", title_ar: "أساسيات اللغة العربية", description: "Build a strong foundation in reading, writing, and basic conversation.", description_ar: "بناء أساس قوي في القراءة والكتابة والمحادثة الأساسية.", level: "beginner", category: "Arabic Language", students: 120, duration: "12 weeks", image: arabicLanguageImg },
  { id: "2", title: "Intermediate Arabic Grammar", title_ar: "النحو العربي المتوسط", description: "Deep dive into Arabic grammar rules — Nahw and Sarf.", description_ar: "دراسة معمّقة في قواعد النحو والصرف.", level: "intermediate", category: "Arabic Language", students: 85, duration: "16 weeks", image: arabicLanguageImg },
  { id: "3", title: "Tajweed Fundamentals", title_ar: "أساسيات التجويد", description: "Learn the rules of Quran recitation with proper pronunciation.", description_ar: "تعلّم أحكام تلاوة القرآن مع النطق الصحيح.", level: "beginner", category: "Tajweed", students: 200, duration: "10 weeks", image: quranTajweedImg },
  { id: "4", title: "Advanced Tajweed", title_ar: "التجويد المتقدم", description: "Master complex Tajweed rules and recitation styles.", description_ar: "إتقان أحكام التجويد المتقدمة وأساليب القراءة.", level: "advanced", category: "Tajweed", students: 60, duration: "20 weeks", image: quranTajweedImg },
  { id: "5", title: "Quran Memorization Program", title_ar: "برنامج حفظ القرآن", description: "Structured Hifz program with weekly milestones and review sessions.", description_ar: "برنامج حفظ منظم مع أهداف أسبوعية وجلسات مراجعة.", level: "beginner", category: "Quran", students: 150, duration: "52 weeks", image: quranTajweedImg },
  { id: "6", title: "Arabic Literature & Poetry", title_ar: "الأدب العربي والشعر", description: "Explore classical and modern Arabic literature and poetry.", description_ar: "استكشاف الأدب والشعر العربي الكلاسيكي والحديث.", level: "advanced", category: "Arabic Language", students: 45, duration: "14 weeks", image: arabicLanguageImg },
];

const Courses = () => {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<string>("all");

  const levels = ["all", "beginner", "intermediate", "advanced"];
  const filtered = filter === "all" ? DEMO_COURSES : DEMO_COURSES.filter((c) => c.level === filter);

  const levelColor = (l: string) => {
    if (l === "beginner") return "bg-emerald/10 text-emerald";
    if (l === "intermediate") return "bg-secondary/20 text-secondary-foreground";
    return "bg-primary/10 text-primary";
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold">{t("Our Courses", "دوراتنا")}</h1>
        <p className="text-muted-foreground">{t("Choose your path to Arabic mastery", "اختر طريقك لإتقان العربية")}</p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {levels.map((l) => (
          <Button
            key={l}
            variant={filter === l ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(l)}
          >
            {l === "all" ? t("All Levels", "جميع المستويات") : t(l.charAt(0).toUpperCase() + l.slice(1), l === "beginner" ? "مبتدئ" : l === "intermediate" ? "متوسط" : "متقدم")}
          </Button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((course, i) => (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="group h-full overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-40 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <BookOpen className="h-16 w-16 text-primary/40 group-hover:scale-110 transition-transform" />
              </div>
              <CardContent className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary" className={levelColor(course.level)}>
                    {t(course.level.charAt(0).toUpperCase() + course.level.slice(1), course.level === "beginner" ? "مبتدئ" : course.level === "intermediate" ? "متوسط" : "متقدم")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{course.category}</span>
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  {language === "ar" ? course.title_ar : course.title}
                </h3>
                <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                  {language === "ar" ? course.description_ar : course.description}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {course.students} {t("students", "طالب")}</div>
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {course.duration}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Courses;
