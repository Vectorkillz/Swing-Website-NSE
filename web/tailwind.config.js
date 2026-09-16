/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0F0F12",
        panel: "#17171D",
        panel2: "#1F1F27",
        line: "#2A2A34",
        muted: "#8E93A3",
        text: "#F3F4F8",
        long: "#00E676",
        short: "#FF334B",
        warn: "#F5B544",
        accent: "#00E676",
        blue: "#6EA8FE",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,230,118,0.25), 0 8px 30px -12px rgba(0,230,118,0.35)",
      },
    },
  },
  plugins: [],
};
