import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  build: { target: "es2022" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120000, hookTimeout: 120000 },
});
