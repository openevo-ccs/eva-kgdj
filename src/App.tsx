import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { isEditor, useSession } from "./state/session";
import LoginPage from "./pages/LoginPage";
import ExplorerPage from "./pages/ExplorerPage";
import ProposalsPage, { NewProposalPage } from "./pages/ProposalsPage";
import ProposalPage from "./pages/ProposalPage";
import EditorialPage from "./pages/EditorialPage";
import PortfolioPage from "./pages/PortfolioPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import AccountPage from "./pages/AccountPage";

export default function App() {
  const { api, session, profile, loading } = useSession();
  if (loading) return <div className="page"><div className="muted">Loading…</div></div>;
  if (!session) return <LoginPage />;
  if (session && !profile) return <div className="page page-narrow"><div className="card"><h1>Not a member yet</h1><p>Your account exists but is not on the KGDJ allowlist (MPI-EVA and Uni-Leipzig addresses, or an invitation). Ask an editor for an invitation.</p></div></div>;
  return (
    <div className="app">
      {api?.mode === "mock" && <div className="mockbar">MOCK MODE — in-memory data, no backend. Persona via <code>?as=student|student2|researcher|editor|instructor|admin</code>. Nothing is stored.</div>}
      <header className="topbar">
        <div className="brand"><b>Eva</b> KGDJ <small>Knowledge Graph Data Journal · MPI-EVA / Uni-Leipzig MSc</small></div>
        <nav className="nav">
          <NavLink to="/explore">Graph</NavLink>
          <NavLink to="/proposals">Proposals</NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
          {isEditor(profile) && <NavLink to="/editorial">Editorial</NavLink>}
          <NavLink to="/leaderboard">Leaderboard</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="whoami"><span className="chip">{profile!.role.replace("_", " ")}</span>{profile!.username}</div>
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
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </main>
    </div>
  );
}
