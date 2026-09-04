import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Eva KGDJ — standalone Vite app under apps/kgdj/. Nothing here reaches into
// ask-eva-app/ (the AI-agent whiteboard): the only shared things are copied
// design tokens (src/styles.css) and the department registry values.
export default defineConfig({
  plugins: [react()],
  base: process.env.KGDJ_BASE || "/",
  server: { port: 5173, strictPort: false },
  build: { outDir: "dist", sourcemap: false, target: "es2020" },
});
