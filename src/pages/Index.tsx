// FIXED — replaced accidental edge-function overwrite with correct landing page
// src/pages/Index.tsx — Tahleem Academy Landing Page
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  BookOpen, GraduationCap, Globe, Star,
  ChevronRight, Users, Clock, CheckCircle, ArrowRight,
} from "lucide-react";

const G     = "#064E3B";
const GM    = "#065F46";
const GOLD  = "#C9973A";
const GOLD2 = "#E8C070";

const fadeUp = {
  hidden:  { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

function Hero() {
  const { t, language } = useLanguage();
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <section dir={dir} style={{ background: `linear-gradient(150deg,${G} 0%,#022c22 55%,#0a1f0f 100%)`, padding: "72px 20px 80px", position: "relative", overflow: "hidden" }}>
      {[240,380,520].map((size,i) => (
        <div key={i} style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:size, height:size, borderRadius:"50%", border:`1px solid rgba(201,151,58,${0.08-i*0.02})`, pointerEvents:"none" }} />
      ))}
      <div className="max-w-2xl mx-auto text-center relative z-10">
        <motion.p initial="hidden" animate="visible" custom={0} variants={fadeUp} style={{ fontFamily:"'Amiri',serif", color:GOLD2, fontSize:"1.3em", direction:"rtl", marginBottom:12, opacity:0.9 }}>
          بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
        </motion.p>
        <motion.h1 initial="hidden" animate="visible" custom={1} variants={fadeUp} className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
          {t("Learn Quran & Arabic","تعلّم القرآن والعربية")} <span style={{ color:GOLD }}>{t("Online","عبر الإنترنت")}</span>
        </motion.h1>
        <motion.p initial="hidden" animate="visible" custom={2} variants={fadeUp} className="mt-4 text-base sm:text-lg" style={{ color:"rgba(255,255,255,0.72)", lineHeight:1.7, maxWidth:520, margin:"16px auto 0" }}>
          {t("Join Tahleem Academy for structured, expert-led courses in Quran memorisation, Tajweed, Arabic language and Islamic Sciences.","انضم إلى أكاديمية تعليم للدراسة المنظمة في حفظ القرآن والتجويد واللغة العربية والعلوم الإسلامية.")}
        </motion.p>
        <motion.div initial="hidden" animate="visible" custom={3} variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <Link to="/register" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:12, background:`linear-gradient(135deg,${GOLD},${GOLD2})`, color:"#1a0e00", fontWeight:800, fontSize:15, textDecoration:"none", boxShadow:"0 4px 18px rgba(201,151,58,0.38)" }}>
            {t("Enrol Now","سجّل الآن")} <ArrowRight size={16} />
          </Link>
          <Link to="/courses" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 24px", borderRadius:12, border:"1.5px solid rgba(255,255,255,0.25)", color:"#fff", fontWeight:600, fontSize:15, textDecoration:"none", background:"rgba(255,255,255,0.07)" }}>
            {t("Browse Courses","تصفّح الدورات")}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function StatsBar() {
  const { t } = useLanguage();
  const stats = [
    { icon: Users,         value:"200+", label:t("Students","طالب") },
    { icon: BookOpen,      value:"12+",  label:t("Courses","دورة") },
    { icon: GraduationCap, value:"5+",   label:t("Expert Teachers","معلم متخصص") },
    { icon: Clock,         value:"100%", label:t("Online & Live","مباشر عبر الإنترنت") },
  ];
  return (
    <section style={{ background:"#fff", borderBottom:"1px solid #f0f0f0" }}>
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-0">
        {stats.map(({ icon:Icon, value, label }, i) => (
          <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once:true }} custom={i} variants={fadeUp} className="flex flex-col items-center justify-center py-6 px-4" style={{ borderRight: i<3?"1px solid #f0f0f0":undefined }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2" style={{ background:`${G}14` }}><Icon size={17} color={G} strokeWidth={2} /></div>
            <p className="text-xl font-black" style={{ color:G }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color:"#6b7280" }}>{label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const COURSES = [
  { icon:BookOpen,      titleEn:"Quran & Tajweed",          titleAr:"القرآن والتجويد",   descEn:"Master correct recitation with proper Tajweed under qualified teachers.",                                descAr:"أتقن تلاوة القرآن الكريم بأحكام التجويد الصحيحة تحت إشراف معلمين مؤهلين.", tag:"🌙" },
  { icon:GraduationCap, titleEn:"Al-Hifdh (Memorisation)",  titleAr:"الحفظ",             descEn:"Structured memorisation with AI evaluation, revision tracking and weekly assessments.",                descAr:"برنامج منظم لحفظ القرآن مع تقييم ذكي وتتبع المراجعة والاختبارات الأسبوعية.", tag:"📖" },
  { icon:Globe,          titleEn:"Arabic Language",          titleAr:"اللغة العربية",     descEn:"From beginner foundations to advanced Nahw & Sarf — classical and modern Arabic.",                     descAr:"من الأساسيات للمبتدئين إلى النحو والصرف المتقدم — العربية الكلاسيكية والحديثة.", tag:"📝" },
  { icon:Star,           titleEn:"Islamic Sciences",         titleAr:"العلوم الإسلامية",  descEn:"Aqeedah, Fiqh, Hadith, Seerah and Tafseer — comprehensive Islamic knowledge.",                        descAr:"العقيدة والفقه والحديث والسيرة والتفسير — معرفة إسلامية شاملة.", tag:"⭐" },
];

function CoursesSection() {
  const { t, language } = useLanguage();
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <section dir={dir} style={{ background:"#f9fafb", padding:"60px 20px" }}>
      <div className="max-w-3xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once:true }} variants={fadeUp} className="text-center mb-10">
          <p style={{ color:GOLD, fontWeight:700, fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>{t("Our Programmes","برامجنا")}</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color:G }}>{t("What We Teach","ماذا نُدرّس")}</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COURSES.map(({ icon:Icon, titleEn, titleAr, descEn, descAr, tag }, i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once:true }} custom={i} variants={fadeUp} className="rounded-2xl p-5" style={{ background:"#fff", border:"1px solid #e5e7eb", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-none" style={{ background:`${G}12` }}><span style={{ fontSize:18 }}>{tag}</span></div>
                <div>
                  <h3 className="font-bold text-base" style={{ color:G }}>{t(titleEn,titleAr)}</h3>
                  <p className="text-sm mt-1.5" style={{ color:"#6b7280", lineHeight:1.65 }}>{t(descEn,descAr)}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once:true }} custom={4} variants={fadeUp} className="text-center mt-8">
          <Link to="/courses" style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"12px 26px", borderRadius:12, background:G, color:"#fff", fontWeight:700, fontSize:14, textDecoration:"none" }}>
            {t("View All Courses","عرض جميع الدورات")} <ChevronRight size={15} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function WhySection() {
  const { t, language } = useLanguage();
  const dir = language === "ar" ? "rtl" : "ltr";
  const points = [
    { en:"Live classes with qualified, experienced teachers",             ar:"دروس مباشرة مع معلمين مؤهلين وذوي خبرة" },
    { en:"Structured Tasjeel pathway from signup to first class",        ar:"مسار تسجيل منظم من التسجيل حتى الحضور" },
    { en:"AI-powered recitation evaluation for Al-Hifdh students",       ar:"تقييم التلاوة بالذكاء الاصطناعي لطلاب الحفظ" },
    { en:"Bilingual platform — Arabic & English throughout",             ar:"منصة ثنائية اللغة — العربية والإنجليزية" },
    { en:"Regular exams, progress tracking and teacher feedback",        ar:"اختبارات منتظمة وتتبع التقدم وتغذية راجعة" },
    { en:"Private sessions available for personalised learning",         ar:"جلسات خاصة متاحة للتعلم الشخصي" },
  ];
  return (
    <section dir={dir} style={{ background:"#fff", padding:"60px 20px" }}>
      <div className="max-w-3xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once:true }} variants={fadeUp} className="text-center mb-10">
          <p style={{ color:GOLD, fontWeight:700, fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>{t("Why Choose Us","لماذا تختارنا")}</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color:G }}>{t("The Tahleem Difference","ما يميّز تعليم")}</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {points.map((p,i) => (
            <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once:true }} custom={i} variants={fadeUp} className="flex items-start gap-3 p-4 rounded-xl" style={{ background:"#f9fafb", border:"1px solid #f0f0f0" }}>
              <CheckCircle size={17} color={G} className="flex-none mt-0.5" />
              <p className="text-sm" style={{ color:"#374151", lineHeight:1.6 }}>{t(p.en,p.ar)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuranBanner() {
  const GOLD2_LOCAL = "#E8C070";
  return (
    <section style={{ background:`linear-gradient(135deg,${G},#022c22)`, padding:"52px 24px", textAlign:"center" }}>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once:true }} variants={fadeUp}>
        <p style={{ fontFamily:"'Amiri',serif", color:GOLD2_LOCAL, fontSize:"1.6em", direction:"rtl", lineHeight:2.2 }}>﴿ إِقۡرَأۡ بِٱسۡمِ رَبِّكَ ٱلَّذِي خَلَقَ ﴾</p>
        <p style={{ color:"rgba(255,255,255,0.55)", fontSize:13, marginTop:8, fontStyle:"italic" }}>"Read in the name of your Lord who created" — Al-Alaq 96:1</p>
      </motion.div>
    </section>
  );
}

function CTA() {
  const { t, language } = useLanguage();
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <section dir={dir} style={{ background:"#f9fafb", padding:"64px 20px" }}>
      <motion.div initial="hidden" whileInView="visible" viewport={{ once:true }} variants={fadeUp} className="max-w-md mx-auto text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background:`linear-gradient(135deg,${G},${GM})` }}><BookOpen size={26} color="#fff" /></div>
        <h2 className="text-2xl font-extrabold mb-3" style={{ color:G }}>{t("Begin Your Journey","ابدأ رحلتك")}</h2>
        <p className="text-sm mb-7" style={{ color:"#6b7280", lineHeight:1.7 }}>{t("Register today and take the first step towards mastering the Quran and Arabic language with expert guidance.","سجّل اليوم وخذ الخطوة الأولى نحو إتقان القرآن الكريم واللغة العربية بتوجيه متخصص.")}</p>
        <Link to="/register" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 32px", borderRadius:14, background:`linear-gradient(135deg,${G},${GM})`, color:"#fff", fontWeight:800, fontSize:15, textDecoration:"none", boxShadow:"0 4px 18px rgba(6,78,59,0.28)" }}>
          {t("Register for Free","التسجيل مجاناً")} <ArrowRight size={16} />
        </Link>
        <p className="mt-4 text-xs" style={{ color:"#9ca3af" }}>
          {t("Already have an account?","لديك حساب بالفعل؟")}{" "}
          <Link to="/login" style={{ color:G, fontWeight:600 }}>{t("Sign in","تسجيل الدخول")}</Link>
        </p>
      </motion.div>
    </section>
  );
}

// ══ MAIN ══════════════════════════════════════════════════════════════════════
const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/student", { replace: true });
  }, [user, loading, navigate]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh" }}>
      <div style={{ width:32, height:32, borderRadius:"50%", border:`3px solid ${G}`, borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Tahleem Academy — Learn Quran & Arabic Online</title>
        <meta name="description" content="Tahleem Academy offers structured online courses in Quran memorisation, Tajweed, Arabic language and Islamic Sciences with expert teachers." />
      </Helmet>
      <Hero />
      <StatsBar />
      <CoursesSection />
      <WhySection />
      <QuranBanner />
      <CTA />
    </>
  );
};

export default Index;
