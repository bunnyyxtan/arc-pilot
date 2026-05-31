import Link from "next/link";

export function ArcPilotLogo() {
  return (
    <Link href="/" className="flex items-center gap-3 group">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-panel to-panelSolid border border-borderLight shadow-glow transition-all group-hover:shadow-glow-violet overflow-hidden">
        {/* Abstract Arc/Wing SVG */}
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-accent group-hover:text-white transition-colors duration-300">
          <path d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20L12 12L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="font-heading text-[17px] font-medium leading-tight tracking-[0] text-white">ArcPilot</span>
        <span className="text-[9px] font-medium uppercase leading-none tracking-[0.22em] text-accent">OS</span>
      </div>
    </Link>
  );
}
