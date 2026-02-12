import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { BookOpen, Mail, Phone } from "lucide-react";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20">
                <BookOpen className="h-5 w-5 text-gold" />
              </div>
              <span className="text-lg font-bold font-display">
                {t("Tahleem", "تعليم")}
                <span className="text-gold"> {t("Academy", "أكاديمية")}</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-primary-foreground/60">
              {t(
                "Empowering students to master Arabic through structured learning and certified courses.",
                "تمكين الطلاب من إتقان اللغة العربية من خلال التعلم المنظم والدورات المعتمدة."
              )}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold">{t("Quick Links", "روابط سريعة")}</h4>
            <div className="flex flex-col gap-3 text-sm text-primary-foreground/60">
              <Link to="/courses" className="transition-colors hover:text-gold">{t("Courses", "الدورات")}</Link>
              <Link to="/about" className="transition-colors hover:text-gold">{t("About Us", "عن الأكاديمية")}</Link>
              <Link to="/contact" className="transition-colors hover:text-gold">{t("Contact", "اتصل بنا")}</Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold">{t("Programs", "البرامج")}</h4>
            <div className="flex flex-col gap-3 text-sm text-primary-foreground/60">
              <span>{t("Arabic Language", "اللغة العربية")}</span>
              <span>{t("Tajweed", "التجويد")}</span>
              <span>{t("Quran Memorization", "حفظ القرآن")}</span>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold">{t("Contact", "اتصل بنا")}</h4>
            <div className="flex flex-col gap-3 text-sm text-primary-foreground/60">
              <a href="mailto:Tahleemacademy09@gmail.com" className="flex items-center gap-2 transition-colors hover:text-gold">
                <Mail className="h-4 w-4 text-gold/60" />
                <span>Tahleemacademy09@gmail.com</span>
              </a>
              <a href="tel:+2348163310471" className="flex items-center gap-2 transition-colors hover:text-gold">
                <Phone className="h-4 w-4 text-gold/60" />
                <span>+2348163310471</span>
              </a>
            </div>
          </div>
        </div>

        <div className="gold-divider mt-10 mb-6 opacity-20" />
        <div className="text-center text-sm text-primary-foreground/40">
          © {new Date().getFullYear()} {t("Tahleem Academy. All rights reserved.", "أكاديمية تعليم. جميع الحقوق محفوظة.")}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
