import { defineConfig } from "vite";

// Relative base so the built `dist/` folder also works on GitHub Pages
// or any sub-path static host.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
});
