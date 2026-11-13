import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    // `src/db/database.ts` finds `drizzle/` relative to the bundle, two levels up.
    outDir: "dist/src",
    platform: "node",
    target: "node24",
    fixedExtension: false,
    dts: false,
    deps: {
      // The runtime image ships no node_modules.
      alwaysBundle: [/./],
      // Only the t3code-cli keystore imports this native module, lazily; the gateway never loads it.
      neverBundle: ["@napi-rs/keyring"],
      onlyBundle: false,
    },
  },
});
