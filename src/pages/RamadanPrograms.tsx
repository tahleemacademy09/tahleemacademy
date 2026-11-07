import { Moon, Sparkles, BookOpen, Users, Mic } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/** Shared "coming soon" page for Ramadan Programs — used by the student, teacher and admin sidebars. */
export default function RamadanPrograms() {
  const { t, dir } = useLanguage();
  const items = [
    { icon: BookOpen, en: "Qur'an recitation & khatm plans", ar: "خطط التلاوة والختمة" },
    { icon: Mic,      en: "Daily Taraweeh-style revision",   ar: "مراجعة يومية" },
    { icon: Users,    en: "Group circles with your teachers", ar: "حلقات جماعية مع المعلمين" },
    { icon: Sparkles, en: "Daily reminders & challenges",    ar: "تذكيرات وتحديات يومية" },
  ];
  return (
    <div dir={dir} className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center p-4">
      <div className="w-full overflow-hidden rounded-3xl border shadow-sm"
        style={{ background: "linear-gradient(160deg,#052e16,#14532d)", borderColor: "rgba(255,255,255,.12)" }}>
        <div className="px-6 pb-6 pt-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "rgba(255,255,255,.14)" }}>
            <Moon size={32} color="#fde68a" />
          </div>
          <span className="inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider"
            style={{ background: "#fde68a", color: "#422006" }}>
            {t("Coming soon", "قريبًا")}
          </span>
          <h1 className="mt-3 text-2xl font-black text-white">{t("Ramadan Programs", "برامج رمضان")}</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.88)" }}>
            {t("We are preparing special programs for the blessed month. Stay tuned, in shā’ Allāh.",
               "نعمل على إعداد برامج خاصة للشهر الكريم. ترقّبوها قريبًا بإذن الله.")}
          </p>
        </div>
        <ul className="space-y-2 px-5 pb-7">
          {items.map(({ icon: Icon, en, ar }) => (
            <li key={en} className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.12)" }}>
              <Icon size={18} color="#bbf7d0" className="shrink-0" />
              <span className="text-sm font-semibold text-white">{t(en, ar)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
