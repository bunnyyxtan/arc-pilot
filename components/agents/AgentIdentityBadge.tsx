const CATEGORY_TONES: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /research|analysis|intelligence/i, className: "border-info/25 bg-info/[0.08] text-info" },
  { pattern: /trade|market|finance|treasury/i, className: "border-success/25 bg-success/[0.08] text-success" },
  { pattern: /code|developer|engineering|technical/i, className: "border-accent/25 bg-accent/[0.08] text-accent" },
  { pattern: /content|writing|creative|media/i, className: "border-warning/25 bg-warning/[0.08] text-warning" }
];

function initials(name: string) {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return letters || "AP";
}

export function AgentIdentityBadge({ name, category, size = "md" }: { name: string; category?: string | null; size?: "md" | "lg" }) {
  const tone = CATEGORY_TONES.find(({ pattern }) => pattern.test(category || ""))?.className
    || "border-slate-400/20 bg-white/[0.045] text-slate-200";
  const dimensions = size === "lg" ? "h-20 w-20 rounded-2xl text-[22px]" : "h-12 w-12 rounded-xl text-[15px]";

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden border font-heading font-medium ${dimensions} ${tone}`}>
      <div className="absolute inset-[5px] rounded-[inherit] border border-white/[0.08]" />
      <span className="relative">{initials(name)}</span>
    </div>
  );
}
