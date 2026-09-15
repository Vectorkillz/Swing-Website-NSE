import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE is "/<repo-name>/" on GitHub Pages and "/" locally.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
