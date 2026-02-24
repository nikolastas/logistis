import { Routes, Route, NavLink } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { Upload } from "./pages/Upload";
import { Review } from "./pages/Review";
import { Dashboard } from "./pages/Dashboard";
import { Goals } from "./pages/Goals";
import { Settings } from "./pages/Settings";
import { Budget } from "./pages/Budget";

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? "bg-slate-200 text-slate-900" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <nav className="flex gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <NavLink to="/" end className={linkClass}>
        Dashboard
      </NavLink>
      <NavLink to="/upload" className={linkClass}>
        Upload
      </NavLink>
      <NavLink to="/review" className={linkClass}>
        Review
      </NavLink>
      <NavLink to="/goals" className={linkClass}>
        Goals
      </NavLink>
      <NavLink to="/budget" className={linkClass}>
        Budget
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        <SettingsIcon className="w-4 h-4 inline-block mr-1.5 align-middle" />
        Settings
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/review" element={<Review />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
