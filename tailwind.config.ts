import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0B1F3A",
          indigo: "#1F3C88",
          indigoDeep: "#172E6B",
          orange: "#FF6A1A",
          orangeDeep: "#E55A15",
          emerald: "#0E9F6E",
          amber: "#F59E0B",
          red: "#DC2626",
        },
        surface: {
          app: "#F5F7FA",
          card: "#FFFFFF",
          soft: "#F9FAFB",
        },
        ink: {
          DEFAULT: "#111827",
          slate: "#374151",
          muted: "#6B7280",
          line: "#D1D5DB",
          softLine: "#E5E7EB",
        },
        // Legacy aliases (used by existing components — keep until refactored)
        accent: "#FF6A1A",
        accent2: "#1F3C88",
        steel: "#0B1F3A",
        paper: "#F5F7FA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        brand: "0.875rem",
        card: "1.25rem",
      },
      boxShadow: {
        card: "0 8px 24px rgba(11, 31, 58, 0.08)",
        cardHover: "0 12px 30px rgba(11, 31, 58, 0.12)",
        orangeGlow: "0 10px 22px rgba(255, 106, 26, 0.28)",
        indigoGlow: "0 10px 22px rgba(31, 60, 136, 0.20)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        // v3.37.10 — slide-in-from-right for the personality side drawer.
        slideInRight: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
      },
      animation: {
        fadeIn: "fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideUp: "slideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        slideInRight: "slideInRight 240ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
