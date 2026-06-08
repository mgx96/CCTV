import { defineConfig } from "vite";

// Demo app build for GitHub Pages. Output goes to docs/ so Pages can serve it for free.
// The repo-name base is only needed for the production build served at
// https://<user>.github.io/CCTV/ — the dev server stays at "/".
export default defineConfig(({ command }) => ({
  root: "demo",
  base: command === "build" ? "/CCTV/" : "/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
}));
