import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://endoretic.cc",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],
  build: {
    format: "directory",
  },
});
