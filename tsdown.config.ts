import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/main.ts"],

  format: ["esm"],
  target: "es2022",
  platform: "node",
  external: ["bun:sqlite"],

  sourcemap: true,
  clean: true,
  removeNodeProtocol: false,

  env: {
    NODE_ENV: "production",
  },
})
