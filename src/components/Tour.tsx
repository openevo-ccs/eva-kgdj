// Guided tour: spotlights elements marked data-tour="…" across pages, with
// Next/Back/Skip and a "don't show again" switch (localStorage). No library.
// Steps can navigate to another route before they look for their target.
import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TOUR_STEPS, type TourStep } from "../lib/tour";

const DONE_KEY = "kgdj.tour.done";
export function tourDone() { try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return true; } }
export function setTourDone(v: boolean) { try { v ? localStorage.setItem(DONE_KEY, "1") : localStorage.removeItem(DONE_KEY); } catch { /* ignore */ } }

export function Tour({ open, onClose, steps = TOUR_STEPS }: { open: boolean; onClose: () => void; steps?: TourStep[] }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dontShow, setDontShow] = useState(tourDone());
  const nav = useNavigate(); const loc = useLocation();
  const step = steps[i];

  useEffect(() => { if (open) setI(0); }, [open]);
  // navigate if the step lives on another page
  useEffect(() => { if (!open || !step) return; if (step.route && !loc.pathname.startsWith(step.route)) nav(step.route); }, [open, i]);
  // find the target (retry briefly while the page renders)
  useLayoutEffect(() => {
    if (!open || !step) return;
    let tries = 0; let t: number;
    const look = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      if (el) { el.scrollIntoView({ block: "nearest", inline: "nearest" }); setRect(el.getBoundingClientRect()); }
      else if (tries++ < 20 && step.target) t = window.setTimeout(look, 120);
      else setRect(null);
    };
    look();
    const onResize = () => look();
    window.addEventListener("resize", onResize);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, [open, i, loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") back(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  if (!open || !step) return null;
  const finish = () => { setTourDone(dontShow); onClose(); };
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());
  const back = () => setI(Math.max(0, i - 1));
  const pad = 6;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // card position: below the target if room, else above; centred if no target
  const cardW = 360;
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  if (box) {
    const below = box.top + box.height + 12, spaceBelow = window.innerHeight - below;
    const left = Math.min(Math.max(12, box.left), window.innerWidth - cardW - 12);
    cardStyle = spaceBelow > 220 ? { left, top: below } : { left, bottom: window.innerHeight - box.top + 12 };
  }
  return (
    <div className="tour">
      <div className="tour-backdrop" onClick={finish} />
      {box && <div className="tour-spot" style={box} />}
      <div className="tour-card" style={{ ...cardStyle, width: cardW }} role="dialog" aria-label="Guided tour">
        <div className="tour-head"><b>{step.title}</b><span className="muted">{i + 1} / {steps.length}</span></div>
        <p>{step.text}</p>
        {step.tip && <p className="muted">{step.tip}</p>}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} /> don't show again</label>
          <div className="row">
            <button className="btn" onClick={finish}>Skip</button>
            <button className="btn" onClick={back} disabled={i === 0}>Back</button>
            <button className="btn btn-primary" onClick={next}>{i === steps.length - 1 ? "Done" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
