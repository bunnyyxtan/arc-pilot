export function ProgressBar({ progress, variant = "accent" }: { progress: number; variant?: "accent" | "success" | "warning" | "danger" | "info" }) {
  const variants = {
    accent: "bg-accent shadow-[0_0_10px_rgba(56,189,248,0.5)]",
    success: "bg-success shadow-[0_0_10px_rgba(16,185,129,0.5)]",
    warning: "bg-warning shadow-[0_0_10px_rgba(245,158,11,0.5)]",
    danger: "bg-danger shadow-[0_0_10px_rgba(239,68,68,0.5)]",
    info: "bg-info shadow-[0_0_10px_rgba(59,130,246,0.5)]",
  };

  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full h-1.5 bg-panelSolid border border-borderDark rounded-full overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ease-out ${variants[variant]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
