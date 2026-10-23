import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import PageFallback from "./PageFallback";
import PublicNav from "./PublicNav";
import Footer from "./Footer";

const PublicLayout = () => (
  <div className="flex min-h-screen flex-col">
    <PublicNav />
    <main className="flex-1">
      <Suspense fallback={<PageFallback />}><Outlet /></Suspense>
    </main>
    <Footer />
  </div>
);

export default PublicLayout;

