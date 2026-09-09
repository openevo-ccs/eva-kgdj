type MarkProps = {
  size?: number;
  className?: string;
};

// Ported from openlpm/src/components/openevo-mark.tsx (2026-09-09 brand
// update): a hub connected to three satellites, echoing both the lab's real
// architecture (one lab coordinating many linked base repos/projects) and
// the navy/teal two-tone network motif of the real OpenEvo wordmark on
// openevo.eva.mpg.de. Kept as a small local copy rather than a shared
// package since KGDJ and OpenLPM are separate repos with no shared build.
export function OpenEvoMark({ size = 16, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 12L12 4M12 12L5 19M12 12L19 19" stroke="var(--brand-navy)" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="var(--brand-navy)" />
      <circle cx="12" cy="4" r="1.5" fill="var(--brand-teal)" />
      <circle cx="5" cy="19" r="1.5" fill="var(--brand-teal)" />
      <circle cx="19" cy="19" r="1.5" fill="var(--brand-teal)" />
    </svg>
  );
}

export function OpenEvoAttribution() {
  return (
    <a
      href="http://openevo.eva.mpg.de"
      target="_blank"
      rel="noreferrer"
      className="row"
      style={{ justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", textDecoration: "none" }}
    >
      <OpenEvoMark size={14} />
      A Project from the OpenEvo Computational Curriculum Studies Lab
    </a>
  );
}
