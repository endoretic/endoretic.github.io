import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://endoretic.cc",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],
  vite: {
    environments: {
      astro: {
        // Astro 7.2/Vite 8 content sync otherwise evaluates picomatch as raw ESM.
        optimizeDeps: {
          include: ["picomatch"],
        },
      },
    },
  },
  build: {
    format: "directory",
  },
});
