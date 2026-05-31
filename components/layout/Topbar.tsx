"use client";

import { usePathname } from "next/navigation";

export function Topbar() {
  const pathname = usePathname();
  
  // Quick hack to get a title from pathname
  const getPageTitle = () => {
    if (pathname === "/") return "Overview";
    const parts = pathname?.split("/").filter(Boolean) || [];
    if (parts.length === 0) return "Overview";
    const section = parts[0];
    return section.charAt(0).toUpperCase() + section.slice(1);
  };

  return (
    <header className="sticky top-0 z-30 mx-4 mt-4 h-[60px] rounded-xl border border-borderDark bg-[#080d19]/58 px-4 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.25)] sm:mx-6 lg:mx-7">
      <div className="flex h-full items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="font-heading text-[15px] font-medium leading-none tracking-[0] text-white">{getPageTitle()}</h1>
        <div className="h-4 w-[1px] bg-borderLight/70 mx-1"></div>
        <div className="flex items-center gap-2 rounded-full border border-borderLight/50 bg-white/[0.045] px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
          <span className="text-[12px] font-medium leading-none text-slate-300">Arc Testnet</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-borderDark bg-white/[0.045] p-1 sm:flex">
          <button className="h-8 w-8 rounded-full bg-white/[0.08] text-xs text-white shadow-glow">A</button>
          <button className="h-8 w-8 rounded-full text-xs text-slate-400 transition-colors hover:text-white">☼</button>
        </div>
        <div className="flex items-center gap-2 glass-button px-3 py-2 opacity-80 cursor-not-allowed">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-400" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span className="text-[13px] font-medium leading-none text-slate-400">Wallet UI Pending</span>
        </div>
      </div>
      </div>
    </header>
  );
}
