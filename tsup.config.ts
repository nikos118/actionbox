import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/plugin.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
});
