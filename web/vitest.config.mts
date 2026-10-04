import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    environment: "node",
    // Database tests share one test database; run files one at a time.
    fileParallelism: false,
    globalSetup: ["./src/test/global-setup.ts"],
    testTimeout: 20_000,
    // next-auth imports "next/server" without an extension; let Vite resolve it.
    server: { deps: { inline: ["next-auth"] } },
  },
});
