import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { label: string; value: string | number }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", label, error, options, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-label text-slate-400">{label}</label>}
        <select
          ref={ref}
          className={`appearance-none rounded-lg border border-borderDark bg-panelSolid px-3 py-2.5 text-[13px] leading-5 text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 ${error ? "border-danger focus:border-danger focus:ring-danger" : ""} ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-panelSolid text-white">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);
Select.displayName = "Select";
