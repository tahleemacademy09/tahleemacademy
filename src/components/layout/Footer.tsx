import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { BookOpen, Mail, Phone, MessageCircle, Globe, Home, BookOpenCheck, Info, FileText, PhoneCall } from "lucide-react";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer style={{ background: "#0a1e14" }} className="text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1 — Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20">
                <BookOpen className="h-5 w-5 text-gold" />
              </div>
              <div>
                <span className="text-lg font-bold font-heading text-white">
                  Tahleem <span className="text-gold">Academy</span>
                </span>
                <p className="text-sm font-arabic text-gold" dir="rtl">أكاديمية التعليم</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-white/50 mt-4 font-body">
              {t(
                "Empowering students to master Arabic and Islamic knowledge through structured learning and certified excellence.",
                "تمكين الطلاب من إتقان اللغة العربية والعلوم الإسلامية من خلال التعلم المنظم والتميز المعتمد."
              )}
            </p>
            <div className="flex gap-3 mt-5">
              <a
                href="mailto:Tahleemacademy09@gmail.com"
                className="flex items-center gap-2 text-xs border border-gold/40 text-gold px-3 py-2 rounded-lg hover:bg-gold hover:text-gold-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {t("Email Us", "راسلنا")}
              </a>
              <a
                href="https://wa.me/2348163310471"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs border border-gold/40 text-gold px-3 py-2 rounded-lg hover:bg-gold hover:text-gold-foreground transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Column 2 — Quick Links */}
          <div>
            <h4 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gold border-b border-gold/20 pb-2">
              {t("Quick Links", "روابط سريعة")}
            </h4>
            <div className="flex flex-col gap-3 text-sm text-white/50">
              <Link to="/" className="flex items-center gap-2 hover:text-gold transition-colors"><Home className="h-3.5 w-3.5" />{t("Home", "الرئيسية")}</Link>
              <Link to="/courses" className="flex items-center gap-2 hover:text-gold transition-colors"><BookOpenCheck className="h-3.5 w-3.5" />{t("Courses", "الدورات")}</Link>
              <Link to="/about" className="flex items-center gap-2 hover:text-gold transition-colors"><Info className="h-3.5 w-3.5" />{t("About Us", "عن الأكاديمية")}</Link>
              <Link to="/contact" className="flex items-center gap-2 hover:text-gold transition-colors"><PhoneCall className="h-3.5 w-3.5" />{t("Contact", "اتصل بنا")}</Link>
            </div>
          </div>

          {/* Column 3 — Programs */}
          <div>
            <h4 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gold border-b border-gold/20 pb-2">
              {t("Programs", "البرامج")}
            </h4>
            <div className="flex flex-col gap-3 text-sm text-white/50">
              <span>🔤 {t("Arabic Language", "اللغة العربية")}</span>
              <span>🎵 {t("Tajweed", "التجويد")}</span>
              <span>📖 {t("Quran Memorisation", "حفظ القرآن")}</span>
              <span>⚖️ {t("Islamic Fiqh", "الفقه الإسلامي")}</span>
              <span>🕌 {t("Islamic Sciences", "العلوم الإسلامية")}</span>
            </div>
          </div>

          {/* Column 4 — Contact */}
          <div>
            <h4 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gold border-b border-gold/20 pb-2">
              {t("Contact Us", "اتصل بنا")}
            </h4>
            <div className="flex flex-col gap-3 text-sm text-white/50">
              <a href="mailto:Tahleemacademy09@gmail.com" className="flex items-center gap-2 hover:text-gold transition-colors">
                <Mail className="h-3.5 w-3.5 text-gold/60" />
                Tahleemacademy09@gmail.com
              </a>
              <a href="tel:+2348163310471" className="flex items-center gap-2 hover:text-gold transition-colors">
                <Phone className="h-3.5 w-3.5 text-gold/60" />
                +234 816 331 0471
              </a>
              <a href="https://wa.me/2348163310471" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gold transition-colors">
                <MessageCircle className="h-3.5 w-3.5 text-gold/60" />
                {t("WhatsApp Us", "واتساب")}
              </a>
              <a href="https://tahleemacademy.lovable.app" className="flex items-center gap-2 hover:text-gold transition-colors">
                <Globe className="h-3.5 w-3.5 text-gold/60" />
                tahleemacademy.lovable.app
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="gold-divider mt-12 mb-6 opacity-30" />

        {/* Bottom */}
        <div className="text-center">
          <p className="font-arabic text-gold/70 text-lg mb-2" dir="rtl">
            وَقُل رَّبِّ زِدْنِي عِلْمًا
          </p>
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Tahleem Academy. All Rights Reserved. Built with ❤️ for the Ummah.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
