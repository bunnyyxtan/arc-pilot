export function JobTimeline({ status }: { status: number }) {
  const terminalStep = status === 6
    ? { label: "In Dispute", target: 4 }
    : status === 5
      ? { label: "Rejected", target: 4 }
      : status === 7
        ? { label: "Expired", target: 4 }
        : status === 8
          ? { label: "Refunded", target: 4 }
          : { label: "Completed", target: 4 };
  const steps = [
    { label: "Created", target: 0 },
    { label: "Funded", target: 1 },
    { label: "Running", target: 2 },
    { label: "Submitted", target: 3 },
    terminalStep
  ];

  const currentStep = Math.min(status, 4);
  const isFailed = status === 5 || status === 6 || status === 7 || status === 8;

  return (
    <div className="flex flex-col md:flex-row md:items-center w-full gap-0 pb-2 md:pb-12 pt-2">
      {steps.map((step, idx) => {
        const isPast = currentStep >= step.target;
        const isCurrent = currentStep === step.target;
        const isLast = idx === steps.length - 1;
        
        let nodeColor = "bg-panelSolid border-borderDark text-slate-500";
        let lineClass = "bg-borderDark";
        
        if (isPast) {
          if (isFailed && isLast) {
             nodeColor = "bg-warning/20 border-warning text-warning shadow-glow";
          } else {
             nodeColor = "bg-accent/20 border-accent text-accent shadow-glow";
             lineClass = "bg-accent/50";
          }
        }
        
        if (isCurrent && !isFailed) {
          nodeColor = "bg-accent border-accent text-panelSolid shadow-glow";
        } else if (isCurrent && isFailed) {
          nodeColor = "bg-warning border-warning text-panelSolid shadow-glow";
        }

        return (
          <div key={step.label} className={`flex flex-col md:flex-row ${!isLast ? "flex-1" : ""} md:items-center`}>
            {/* Circle & Label */}
            <div className="relative flex items-center md:flex-col gap-4 md:gap-0 shrink-0">
              <div className={`mono-value flex-center z-10 h-8 w-8 shrink-0 rounded-full border-2 text-xs font-medium transition-all duration-500 ${nodeColor}`}>
                {idx + 1}
              </div>
              <span className={`md:absolute md:top-12 whitespace-nowrap text-[11px] md:text-[10px] font-medium uppercase tracking-[0.18em] ${isPast ? (isFailed && isLast ? "text-warning" : "text-white") : "text-slate-500"}`}>
                {step.label}
              </span>
            </div>
            
            {/* Connector Lines */}
            {!isLast && (
              <>
                <div className={`hidden md:block h-[2px] flex-1 mx-3 rounded-full transition-all duration-500 ${isPast && !isCurrent ? lineClass : "bg-borderDark"}`} />
                <div className={`md:hidden w-[2px] h-8 ml-[15px] my-2 rounded-full transition-all duration-500 ${isPast && !isCurrent ? lineClass : "bg-borderDark"}`} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
