import { getTierForScore, getTierColor } from "../../lib/design/copy";

export function AgentScoreRing({ score, size = "md" }: { score: bigint | number; size?: "sm" | "md" | "lg" }) {
  const numScore = Number(score);
  const tier = getTierForScore(numScore);
  const colorClass = getTierColor(tier).split(" ")[1]; // extract text-color
  const glowClass = colorClass.replace("text-", "shadow-");

  const sizes = {
    sm: "w-16 h-16 text-lg",
    md: "w-24 h-24 text-2xl",
    lg: "w-32 h-32 text-4xl"
  };

  const strokeWidths = {
    sm: 4,
    md: 6,
    lg: 8
  };

  // Calculate SVG circle properties
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(100, Math.max(0, (numScore / 1000) * 100));
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative flex items-center justify-center rounded-full ${sizes[size]} bg-panelSolid/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]`}>
      <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_8px_currentColor] text-white/5" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="flex flex-col items-center justify-center relative z-10">
        <span className={`mono-value font-medium ${colorClass} drop-shadow-[0_0_10px_currentColor]`}>
          {numScore}
        </span>
      </div>
    </div>
  );
}
