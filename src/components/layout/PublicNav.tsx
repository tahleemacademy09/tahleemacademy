import PublicNav from "@/components/layout/PublicNav";

// Inside the JSX return, add before <Outlet />:
<PublicNav />
<Outlet />
/*  src/components/layout/PublicNav.tsx
    Public navigation bar for the homepage and public pages.
    Shows: Logo | Courses | Pricing | About | Contact
    Mobile: hamburger menu with all links + Register CTA
*/
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Menu, X, CreditCard, LogIn, UserPlus, ChevronDown } from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

const NAV_LINKS = [
  { to: "/courses",  label: "Courses" },
  { to: "/pricing",  label: "Pricing", highlight: true },
  { to: "/about",    label: "About" },
  { to: "/contact",  label: "Contact" },
];

const PublicNav = () => {
  const location   = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        .nav-link { transition: color .15s; }
        .nav-link:hover { color: ${GOLD} !important; }
        .mob-link { transition: background .15s; }
        .mob-link:hover { background: rgba(6,78,59,.05) !important; }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: "1px solid rgba(6,78,59,.1)", boxShadow: "0 1px 8px rgba(6,78,59,.06)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: G, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen style={{ width: 18, height: 18, color: GOLD }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: G, lineHeight: 1 }}>
                Tahleem <span style={{ color: GOLD }}>Academy</span>
              </div>
              <div style={{ fontSize: 10, color: "#7a9e88", direction: "rtl" }}>أكاديمية تعليم</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }} className="desktop-nav">
            {NAV_LINKS.map(link => (
              <Link key={link.to} to={link.to} className="nav-link"
                style={{
                  padding: "6px 14px", borderRadius: 8, textDecoration: "none",
                  fontSize: 14, fontWeight: isActive(link.to) ? 700 : 500,
                  color: isActive(link.to) ? G : link.highlight ? GM : "#555",
                  background: link.highlight ? (isActive(link.to) ? "#E8F5E9" : "rgba(6,78,59,.04)") : isActive(link.to) ? "#F0FDF4" : "transparent",
                  border: link.highlight ? `1px solid ${isActive(link.to) ? "#86EFAC" : "rgba(6,78,59,.15)"}` : "1px solid transparent",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                {link.highlight && <CreditCard size={13} />}
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="desktop-nav">
            <Link to="/login"
              style={{ padding: "8px 16px", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600, color: G, border: `1.5px solid rgba(6,78,59,.2)`, display: "flex", alignItems: "center", gap: 6, transition: "all .15s" }}>
              <LogIn size={14} /> Sign In
            </Link>
            <Link to="/register"
              style={{ padding: "8px 18px", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 700, color: "#fff", background: `linear-gradient(135deg,${G},${GM})`, boxShadow: "0 2px 8px rgba(6,78,59,.25)", display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={14} /> Register
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setOpen(p => !p)}
            style={{ background: "none", border: "none", cursor: "pointer", color: G, padding: 6, display: "none" }}
            className="mobile-menu-btn">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div style={{ borderTop: "1px solid rgba(6,78,59,.1)", background: "#fff", animation: "slideDown .2s ease", padding: "12px 0 20px" }}>
            {NAV_LINKS.map(link => (
              <Link key={link.to} to={link.to} className="mob-link" onClick={() => setOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 24px", textDecoration: "none", fontSize: 15, fontWeight: isActive(link.to) ? 700 : 500, color: link.highlight ? GM : G, background: isActive(link.to) ? "#F0FDF4" : "transparent" }}>
                {link.highlight && <CreditCard size={16} color={GM} />}
                {link.label}
                {link.highlight && <span style={{ marginLeft: "auto", fontSize: 11, background: "#E8F5E9", color: GM, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>View Fees</span>}
              </Link>
            ))}
            <div style={{ margin: "12px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <Link to="/login" onClick={() => setOpen(false)}
                style={{ padding: "12px", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 600, color: G, border: `1.5px solid rgba(6,78,59,.2)`, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <LogIn size={16} /> Sign In
              </Link>
              <Link to="/register" onClick={() => setOpen(false)}
                style={{ padding: "13px", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${G},${GM})`, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(6,78,59,.25)" }}>
                <UserPlus size={16} /> Register & Pay ₦5,000
              </Link>
            </div>

            {/* Pricing preview in mobile */}
            <div style={{ margin: "16px 20px 0", background: "#FFFBEB", borderRadius: 12, padding: "12px 16px", border: "1px solid #F9D46A" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>Fee Overview</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { label: "Registration (one-time)", amount: "₦5,000" },
                  { label: "Beginner — Monthly",      amount: "₦5,000" },
                  { label: "Intermediate — Monthly",  amount: "₦6,000" },
                  { label: "Advanced — Monthly",      amount: "₦7,000" },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#78350F" }}>
                    <span>{f.label}</span>
                    <span style={{ fontWeight: 700 }}>{f.amount}</span>
                  </div>
                ))}
              </div>
              <Link to="/pricing" onClick={() => setOpen(false)}
                style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 12, color: GM, fontWeight: 700, textDecoration: "none" }}>
                View full pricing →
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
          .desktop-nav { display: flex !important; }
        }
      `}</style>
    </>
  );
};

export default PublicNav;
