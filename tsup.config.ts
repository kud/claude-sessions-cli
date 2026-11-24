import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.tsx", "src/app.tsx"],
  format: ["esm"],
  clean: true,
})
