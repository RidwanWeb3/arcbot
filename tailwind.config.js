/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        card: {
          DEFAULT: "#111111",
          foreground: "#e5e5e5",
        },
        popover: {
          DEFAULT: "#161616",
          foreground: "#e5e5e5",
        },
        primary: {
          DEFAULT: "#22c55e",
          foreground: "#0a0a0a",
        },
        secondary: {
          DEFAULT: "#1c1c1c",
          foreground: "#a3a3a3",
        },
        muted: {
          DEFAULT: "#1a1a1a",
          foreground: "#737373",
        },
        accent: {
          DEFAULT: "#262626",
          foreground: "#e5e5e5",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#22c55e",
          foreground: "#0a0a0a",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#0a0a0a",
        },
        border: "#262626",
        input: "#262626",
        ring: "#22c55e",
        chart: {
          1: "#22c55e",
          2: "#ef4444",
          3: "#f59e0b",
          4: "#3b82f6",
          5: "#8b5cf6",
        },
      },
      borderRadius: {
        lg: "6px",
        md: "calc(6px - 2px)",
        sm: "calc(6px - 4px)",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
