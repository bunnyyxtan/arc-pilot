import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", children, ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center rounded-lg font-[520] leading-relaxed tracking-[-0.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
    
    const variants = {
      primary: "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:border-accent/40 hover:shadow-glow",
      secondary: "bg-panelSolid text-slate-300 border border-borderLight hover:bg-white/5 hover:text-white",
      danger: "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 hover:border-danger/40",
      success: "bg-success/10 text-success border border-success/20 hover:bg-success/20 hover:border-success/40",
      ghost: "text-slate-400 hover:text-white hover:bg-white/5"
    };

    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-6 py-3.5 text-[15px]"
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
