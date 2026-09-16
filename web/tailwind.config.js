/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see styles.css) so the light theme is a single attribute flip on <html>.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("--c-bg"),
        panel: v("--c-panel"),
        panel2: v("--c-panel2"),
        line: v("--c-line"),
        muted: v("--c-muted"),
        text: v("--c-text"),
        ink: v("--c-ink"),
        long: v("--c-long"),
        short: v("--c-short"),
        warn: v("--c-warn"),
        accent: v("--c-accent"),
        blue: v("--c-blue"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
