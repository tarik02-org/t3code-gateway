import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  base: "/admin/",
  lint: {
    rules: {
      "eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message: "Node APIs are not allowed in the browser package.",
            },
          ],
        },
      ],
    },
  },
  plugins: [
    tanstackStart({
      pages: [
        {
          path: "/admin/",
          prerender: {
            crawlLinks: false,
            outputPath: "index.html",
          },
        },
        {
          path: "/admin/login",
          prerender: {
            crawlLinks: false,
          },
        },
        {
          path: "/admin/mcp",
          prerender: {
            crawlLinks: false,
          },
        },
        {
          path: "/admin/connect",
          prerender: {
            crawlLinks: false,
          },
        },
      ],
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: true,
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
});
