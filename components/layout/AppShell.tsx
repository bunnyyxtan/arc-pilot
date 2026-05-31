"use client";

import { usePathname } from "next/navigation";
import { NavigationBar } from "./NavigationBar";
import { ArcDeploymentGate } from "./ArcDeploymentGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      {/* ─── Ambient Background ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Deep space gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_8%,rgba(147,197,253,0.14),transparent_28%),radial-gradient(ellipse_at_16%_22%,rgba(99,102,241,0.12),transparent_32%),radial-gradient(ellipse_at_50%_80%,rgba(30,58,138,0.06),transparent_45%),linear-gradient(180deg,#060914_0%,#040712_100%)]"></div>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 soft-grid opacity-50"></div>
        {/* Light shafts */}
        <div className="absolute right-[8%] -top-10 h-[600px] w-[200px] rotate-12 bg-[linear-gradient(90deg,transparent,rgba(191,219,254,0.08),transparent)] blur-3xl"></div>
        <div className="absolute left-[15%] top-[60%] h-[400px] w-[160px] -rotate-6 bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.05),transparent)] blur-3xl"></div>
        {/* Side ambient glows for 1600px layout */}
        <div className="absolute left-0 top-1/4 h-[500px] w-[300px] bg-[radial-gradient(ellipse_at_left,rgba(99,102,241,0.03),transparent)] blur-[60px]"></div>
        <div className="absolute right-0 top-1/3 h-[600px] w-[400px] bg-[radial-gradient(ellipse_at_right,rgba(147,197,253,0.03),transparent)] blur-[80px]"></div>
      </div>

      {!isLanding && <NavigationBar />}

      <main className="relative z-10 flex flex-col h-screen w-full overflow-hidden">
        <div className={`overflow-y-auto overflow-x-hidden w-full ${isLanding ? "flex-1" : "flex-1 pt-[120px] px-4 pb-20 sm:px-6 lg:px-8"}`}>
          <div className={isLanding ? "w-full" : "mx-auto max-w-[1600px] animate-fadeInUp"}>
            {isLanding ? children : <ArcDeploymentGate>{children}</ArcDeploymentGate>}
          </div>
        </div>
      </main>
    </div>
  );
}
