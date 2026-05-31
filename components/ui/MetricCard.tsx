import { Card } from "./Card";
import type { ReactNode } from "react";

export function MetricCard({
  title,
  value,
  subtext,
  icon
}: {
  title: string;
  value: ReactNode;
  subtext?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-px scanline"></div>
      <div className="mb-5 flex items-start justify-between">
        <h3 className="text-label text-slate-500">{title}</h3>
        {icon && <div className="text-slate-500 transition-colors group-hover:text-accent">{icon}</div>}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="font-heading text-[28px] font-[520] leading-[1.1] tracking-[-0.02em] tabular-nums text-white sm:text-[32px]">{value}</div>
        {subtext && <div className="text-[13px] leading-5 text-slate-500">{subtext}</div>}
      </div>
    </Card>
  );
}
