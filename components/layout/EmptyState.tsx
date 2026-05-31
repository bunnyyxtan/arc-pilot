import type { ReactNode } from "react";

export function EmptyState({ title, description, icon, action }: { title: string; description: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass-card flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
      <div className="w-16 h-16 rounded-full bg-panel border border-borderDark flex-center text-slate-500 mb-6 shadow-glow">
        {icon || (
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>
      <h3 className="text-xl font-medium text-white mb-2">{title}</h3>
      <p className="text-slate-400 max-w-md mb-8">{description}</p>
      {action}
    </div>
  );
}
