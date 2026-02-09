import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { BookOpen, Mail, Phone } from "lucide-react";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-primary font-arabic">
                {t("Tahleem Academy", "أكاديمية تعليم")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "Empowering students to master Arabic through structured learning and certified courses.",
                "تمكين الطلاب من إتقان اللغة العربية من خلال التعلم المنظم والدورات المعتمدة."
              )}
            </p>
          </div>

          <div>
            <h4 className="mb-3 font-semibold">{t("Quick Links", "روابط سريعة")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/courses" className="hover:text-primary">{t("Courses", "الدورات")}</Link>
              <Link to="/about" className="hover:text-primary">{t("About Us", "عن الأكاديمية")}</Link>
              <Link to="/contact" className="hover:text-primary">{t("Contact", "اتصل بنا")}</Link>
            </div>
          </div>

          <div>
            <h4 className="mb-3 font-semibold">{t("Programs", "البرامج")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>{t("Arabic Language", "اللغة العربية")}</span>
              <span>{t("Tajweed", "التجويد")}</span>
              <span>{t("Quran Memorization", "حفظ القرآن")}</span>
            </div>
          </div>

          <div>
            <h4 className="mb-3 font-semibold">{t("Contact", "اتصل بنا")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>info@tahleemacademy.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>+1 (555) 123-4567</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {t("Tahleem Academy. All rights reserved.", "أكاديمية تعليم. جميع الحقوق محفوظة.")}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
