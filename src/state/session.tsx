import React, { createContext, useContext, useEffect, useState } from "react";
import { createApi, type Api } from "../lib/api";
import type { Department, Module, Profile, Session } from "../lib/types";

interface Ctx { api: Api | null; session: Session | null; profile: Profile | null; departments: Department[]; deptById: Record<string, Department>; myModules: { module: Module; role: string }[]; loading: boolean; refresh: () => Promise<void> }
const C = createContext<Ctx>({ api: null, session: null, profile: null, departments: [], deptById: {}, myModules: [], loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<Api | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [myModules, setMyModules] = useState<{ module: Module; role: string }[]>([]);
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
  const deptById = Object.fromEntries(departments.map((d) => [d.id, d]));
  return <C.Provider value={{ api, session, profile, departments, deptById, myModules, loading, refresh: async () => { if (api) await load(api); } }}>{children}</C.Provider>;
}

export function useSession() { return useContext(C); }
export function useApi(): Api { const { api } = useContext(C); if (!api) throw new Error("api not ready"); return api; }
export function isEditor(p: Profile | null) { return !!p && (p.role === "editor" || p.role === "admin"); }
