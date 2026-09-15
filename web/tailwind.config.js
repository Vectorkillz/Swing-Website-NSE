/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#121722",
        line: "#1f2733",
        muted: "#8b95a7",
        text: "#e6e9ef",
        long: "#2dd4a0",
        short: "#ff5d7a",
        warn: "#f5b544",
        accent: "#6ea8fe",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
