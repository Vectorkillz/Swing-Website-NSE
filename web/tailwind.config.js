/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0a0d12",
        panel: "#141a23",
        panel2: "#1c2430",
        line: "#232c3a",
        muted: "#8b95a7",
        text: "#f2f4f7",
        long: "#1db954",
        short: "#ff5d7a",
        warn: "#f5b544",
        accent: "#1db954",
        blue: "#6ea8fe",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
