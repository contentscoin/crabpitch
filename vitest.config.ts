import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/lib/**/*.test.ts"],
    environment: "node",
  },
});
