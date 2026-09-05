import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { isEditor, useSession } from "./state/session";
import LoginPage from "./pages/LoginPage";
import ExplorerPage from "./pages/ExplorerPage";
import ProposalsPage, { NewProposalPage } from "./pages/ProposalsPage";
import ProposalPage from "./pages/ProposalPage";
import EditorialPage from "./pages/EditorialPage";
import PortfolioPage from "./pages/PortfolioPage";
import CommonsPage from "./pages/CommonsPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import AccountPage from "./pages/AccountPage";
import { Tour, tourDone } from "./components/Tour";
import { Tip } from "./components/Tip";

const NAV_TIP: Record<string, string> = {
  explore: "The canonical, peer-reviewed graph of the institute's research", proposals: "Propose and review changes to the canonical graph", portfolio: "Your own orientation graph, built on the canonical one",
  commons: "Ideas classmates shared with your module — one node, connection, or cluster at a time",
  editorial: "Editors: decide on proposals and promote reviewed seed nodes", leaderboard: "Many boards for many strengths — opt in from Account", account: "Affiliation, consent, data export, deletion",
};

export default function App() {
  const { api, session, profile, loading } = useSession();
  const [tour, setTour] = useState(false); const [help, setHelp] = useState(false);
  useEffect(() => { const on = () => setTour(true); window.addEventListener("kgdj:tour", on); return () => window.removeEventListener("kgdj:tour", on); }, []);
  useEffect(() => { if (session && profile && !tourDone()) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, [session, profile]);
  if (loading) return <div className="page"><div className="muted">Loading…</div></div>;
  if (!session) return <LoginPage />;
  if (session && !profile) return <div className="page page-narrow"><div className="card"><h1>Not a member yet</h1><p>Your account exists but is not on the KGDJ allowlist (MPI-EVA and Uni-Leipzig addresses, or an invitation). Ask an editor for an invitation.</p></div></div>;
  return (
    <div className="app" onClick={() => help && setHelp(false)}>
      {api?.mode === "mock" && <div className="mockbar">MOCK MODE — in-memory data, no backend. Persona via <code>?as=student|student2|researcher|editor|instructor|admin</code>. Nothing is stored.</div>}
      <header className="topbar">
        <div className="brand"><b>Eva</b> KGDJ <small>Knowledge Graph Data Journal · MPI-EVA / Uni-Leipzig MSc</small></div>
        <nav className="nav">
          <Tip text={NAV_TIP.explore} place="bottom"><NavLink to="/explore" data-tour="nav-explore">Graph</NavLink></Tip>
          <Tip text={NAV_TIP.proposals} place="bottom"><NavLink to="/proposals" data-tour="nav-proposals">Proposals</NavLink></Tip>
          <Tip text={NAV_TIP.portfolio} place="bottom"><NavLink to="/portfolio" data-tour="nav-portfolio">Portfolio</NavLink></Tip>
          <Tip text={NAV_TIP.commons} place="bottom"><NavLink to="/commons" data-tour="nav-commons">Commons</NavLink></Tip>
          {isEditor(profile) && <Tip text={NAV_TIP.editorial} place="bottom"><NavLink to="/editorial">Editorial</NavLink></Tip>}
          <Tip text={NAV_TIP.leaderboard} place="bottom"><NavLink to="/leaderboard" data-tour="nav-leaderboard">Leaderboards</NavLink></Tip>
          <Tip text={NAV_TIP.account} place="bottom"><NavLink to="/account" data-tour="nav-account">Account</NavLink></Tip>
        </nav>
        <div className="whoami">
          <span style={{ position: "relative" }}>
            <button className="btn btn-mini" onClick={(e) => { e.stopPropagation(); setHelp(!help); }} aria-expanded={help}>? Help</button>
            {help && <div className="popover" style={{ right: 0, left: "auto", width: 260 }} onClick={(e) => e.stopPropagation()}>
              <div className="menu">
                <button onClick={() => { setHelp(false); setTour(true); }}><b>Guided tour</b><span className="muted">Two minutes through the six pages</span></button>
                <div style={{ padding: "6px 8px", fontSize: 12 }}><b>Shortcuts</b><div className="muted">Esc: close panel / clear selection · Ctrl+click: multi-select · Ctrl+drag: box select · scroll: zoom · Fit: whole graph</div></div>
                <div style={{ padding: "6px 8px", fontSize: 12 }}><b>Statuses</b><div className="muted">dashed = proposed / awaiting review · green = canonical · double red = member-authored</div></div>
              </div>
            </div>}
          </span>
          <span className="chip">{profile!.role.replace("_", " ")}</span>{profile!.username}
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/explore" replace />} />
          <Route path="/explore" element={<ExplorerPage />} />
          <Route path="/explore/:nodeId" element={<ExplorerPage />} />
          <Route path="/proposals" element={<ProposalsPage />} />
          <Route path="/proposals/new" element={<NewProposalPage />} />
          <Route path="/proposals/:id" element={<ProposalPage />} />
          <Route path="/editorial" element={isEditor(profile) ? <EditorialPage /> : <Navigate to="/explore" replace />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/portfolio/:id" element={<PortfolioPage />} />
          <Route path="/commons" element={<CommonsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </main>
      <Tour open={tour} onClose={() => setTour(false)} />
    </div>
  );
}
