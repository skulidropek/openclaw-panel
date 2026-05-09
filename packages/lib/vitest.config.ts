import path from "node:path"
import { fileURLToPath } from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "dist-test"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/__tests__/**",
        "scripts/**/*.ts"
      ],
      thresholds: {
        "src/core/**/*.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100
        },
        global: {
          branches: 10,
          functions: 10,
          lines: 10,
          statements: 10
        }
      }
    },
    clearMocks: true,
    mockReset: true,
    restoreMocks: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
})
