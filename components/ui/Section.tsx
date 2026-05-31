import type { ReactNode } from "react";

export function Section({ title, description, children, className = "" }: { title?: ReactNode; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      {(title || description) && (
        <div className="flex flex-col gap-1 mb-2">
          {title && <h3 className="font-heading text-lg font-medium tracking-[0] text-white">{title}</h3>}
          {description && <p className="text-[13px] leading-6 text-slate-400">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
