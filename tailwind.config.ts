import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/design/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Neue Montreal", "Satoshi", "Geist", "system-ui", "sans-serif"],
        body: ["Neue Montreal", "Satoshi", "Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "IBM Plex Mono", "JetBrains Mono", "monospace"]
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        panel: "rgba(9, 14, 27, 0.68)",
        panelSolid: "#0B1020",
        borderDark: "rgba(226, 232, 240, 0.085)",
        borderLight: "rgba(226, 232, 240, 0.18)",
        borderAccent: "rgba(147, 197, 253, 0.22)",
        accent: "#93C5FD",
        accentGlow: "rgba(147, 197, 253, 0.42)",
        secondaryGlow: "rgba(99, 102, 241, 0.2)",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-panel': 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.4) 100%)',
        'gradient-accent': 'linear-gradient(135deg, #93C5FD 0%, #818CF8 50%, #A78BFA 100%)',
        'gradient-success': 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
        'gradient-danger': 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
        'gradient-surface': 'linear-gradient(180deg, rgba(15,23,42,0.72), rgba(8,12,24,0.58))',
      },
      boxShadow: {
        'glow': '0 0 20px -5px rgba(147, 197, 253, 0.35)',
        'glow-sm': '0 0 12px -3px rgba(147, 197, 253, 0.25)',
        'glow-lg': '0 0 40px -8px rgba(147, 197, 253, 0.4)',
        'glow-violet': '0 0 30px -10px rgba(139, 92, 246, 0.4)',
        'glow-success': '0 0 20px -5px rgba(16, 185, 129, 0.35)',
        'glow-danger': '0 0 20px -5px rgba(239, 68, 68, 0.35)',
        'glow-warning': '0 0 20px -5px rgba(245, 158, 11, 0.35)',
        'depth-sm': '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        'depth-md': '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'depth-lg': '0 24px 80px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'inner-glow': 'inset 0 0 30px rgba(147, 197, 253, 0.06)',
      },
      animation: {
        'scan': 'scan 5s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite',
        'fadeInUp': 'fadeInUp 0.5s ease-out both',
        'glowPulse': 'glowPulse 3s ease-in-out infinite',
        'liveIndicator': 'liveIndicator 2s ease-in-out infinite',
      },
      transitionDuration: {
        '400': '400ms',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      }
    }
  },
  plugins: []
};

export default config;
