import { Outlet } from "react-router-dom";
import PublicNav from "./PublicNav";
import Footer from "./Footer";

const PublicLayout = () => (
  <div className="flex min-h-screen flex-col">
    <PublicNav />
    <main className="flex-1">
      <Outlet />
    </main>
    <Footer />
  </div>
);

export default PublicLayout;
