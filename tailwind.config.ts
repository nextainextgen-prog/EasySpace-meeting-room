import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "var(--font-plex-thai)",
          "Plus Jakarta Sans",
          "IBM Plex Sans Thai",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        primary: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#7C8EF9",
          500: "#3B5BDB",
          600: "#2D4EF5",
          700: "#1E3AE8",
          800: "#1730BD",
          900: "#0F1F8F",
        },
        ink: {
          1: "#0F172A",
          2: "#475569",
          3: "#94A3B8",
        },
        surface: {
          page: "#F5F7FA",
          card: "#FFFFFF",
          subtle: "#F8FAFC",
        },
        line: {
          DEFAULT: "#E8ECF2",
          soft: "#F1F4F8",
        },
        status: {
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
          info: "#3B82F6",
        },
      },
      borderRadius: {
        card: "20px",
        "card-lg": "24px",
        "card-sm": "16px",
        pill: "999px",
        input: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.03)",
        "card-hover": "0 4px 16px rgba(45,78,245,0.08)",
        hero: "0 12px 32px rgba(45,78,245,0.20)",
        pop: "0 8px 24px rgba(15,23,42,0.10)",
      },
      letterSpacing: {
        tightest: "-0.025em",
        tighter: "-0.02em",
        tight: "-0.015em",
      },
      backgroundImage: {
        "primary-gradient":
          "linear-gradient(135deg, #2D4EF5 0%, #4F6FFC 100%)",
        "primary-gradient-deep":
          "linear-gradient(135deg, #1E3AE8 0%, #3B5BDB 100%)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
