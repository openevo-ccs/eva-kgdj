import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createApi, type Api } from "../lib/api";
import type { Department, Module, ModuleMemberRole, Profile, Session } from "../lib/types";

interface Ctx { api: Api | null; session: Session | null; profile: Profile | null; departments: Department[]; deptById: Record<string, Department>; myModules: { module: Module; role: ModuleMemberRole }[]; loading: boolean; refresh: () => Promise<void> }
const C = createContext<Ctx>({ api: null, session: null, profile: null, departments: [], deptById: {}, myModules: [], loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<Api | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [myModules, setMyModules] = useState<{ module: Module; role: ModuleMemberRole }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(a: Api) {
    const s = await a.getSession();
    setSession(s);
    if (s) {
      const [p, d, m] = await Promise.all([a.me(), a.departments(), a.myModules()]);
      setProfile(p); setDepartments(d); setMyModules(m);
    } else { setProfile(null); setMyModules([]); }
    setLoading(false);
  }
  useEffect(() => {
    let off = () => {};
    createApi().then((a) => { setApi(a); load(a); off = a.onAuthChange(() => load(a)); }).catch((e) => { console.error(e); setLoading(false); });
    return () => off();
  }, []);
  // Memoized on purpose: session/profile/loading all update on their own ticks as `load()`
  // proceeds (getSession, then departments/profile/myModules in parallel, then loading=false) —
  // an unmemoized object literal here would hand every consumer (GraphCanvas among them, via
  // ExplorerPage/PortfolioPage's deptById prop) a fresh reference on each of those unrelated
  // updates, which is exactly the kind of spurious re-render GraphCanvas now has to defend
  // against anyway (see its own element-patching comment) — fixing it at the source too.
  const deptById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments]);
  return <C.Provider value={{ api, session, profile, departments, deptById, myModules, loading, refresh: async () => { if (api) await load(api); } }}>{children}</C.Provider>;
}

export function useSession() { return useContext(C); }
export function useApi(): Api { const { api } = useContext(C); if (!api) throw new Error("api not ready"); return api; }
export function isEditor(p: Profile | null) { return !!p && (p.role === "editor" || p.role === "admin"); }
