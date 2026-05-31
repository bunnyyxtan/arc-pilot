"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAVIGATION_LINKS, SYSTEM_LINKS } from "../../lib/design/navigation";
import { ArcPilotLogo } from "../brand/ArcPilotLogo";

// Simple icon mapper based on string names
function Icon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "ChartBar":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10M18 20V4M6 20v-4" />
        </svg>
      );
    case "Users":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "Briefcase":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "BuildingLibrary":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M3 7v10" />
          <path d="M21 7v10" />
          <path d="M7 21v-4" />
          <path d="M17 21v-4" />
          <path d="M12 21v-4" />
          <path d="M12 3l9 4H3l9-4z" />
        </svg>
      );
    case "ShieldExclamation":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      );
    case "Play":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    case "CpuChip":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-4 left-4 z-40 hidden w-[212px] flex-col overflow-hidden rounded-xl glass-panel lg:flex">
      <div className="h-[72px] flex items-center px-4 border-b border-borderDark/80">
        <ArcPilotLogo />
      </div>

      <div className="px-3 pb-3 pt-3">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-borderDark bg-black/16 px-3 text-[12px] leading-none text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <span>Search workspace</span>
          <span className="ml-auto rounded border border-borderDark px-1.5 py-0.5 text-[10px]">⌘K</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
        <div className="text-label px-2 mb-2">Main</div>
        {NAVIGATION_LINKS.map((link) => {
          const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                isActive
                  ? "bg-white/[0.075] text-white shadow-[inset_2px_0_0_0_#93C5FD,0_8px_30px_rgba(96,165,250,0.12)]"
                  : "text-slate-500 hover:bg-white/[0.045] hover:text-slate-200"
              }`}
            >
              <Icon name={link.icon} className={`h-[18px] w-[18px] ${isActive ? "text-accent" : "text-slate-500"}`} />
              <span className="text-[13px] font-[450] leading-relaxed tracking-[-0.01em]">{link.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-3 border-t border-borderDark">
        <div className="rounded-lg border border-borderLight/70 bg-white/[0.045] p-3 shadow-[0_0_45px_rgba(147,197,253,0.1)]">
          <div className="text-label mb-3">System</div>
          <div className="flex flex-col gap-2">
            {SYSTEM_LINKS.map((link) => (
              <div key={link.label} className="flex items-center justify-between">
                <span className="text-[12.5px] font-[450] leading-relaxed tracking-[-0.01em] text-slate-400">{link.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                  <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-300">
                    {link.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/30">
            <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-accent via-white to-indigo-300 shadow-glow"></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
