import { defineConfig } from "vite";

// Library build: bundles the engine + registries into a single ESM file.
// JSON registries are inlined, so the published package needs no runtime file resolution.
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "cctv.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
  },
});
