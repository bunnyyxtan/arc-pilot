import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-label text-slate-400">{label}</label>}
        <input
          ref={ref}
          className={`rounded-lg border border-borderDark bg-panelSolid px-3 py-2.5 text-[13px] leading-5 text-white placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 ${error ? "border-danger focus:border-danger focus:ring-danger" : ""} ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";
