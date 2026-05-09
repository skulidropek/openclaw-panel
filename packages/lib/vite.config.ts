import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [tsconfigPaths()],
  publicDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    target: "node20",
    outDir: "dist",
    sourcemap: true,
    ssr: "src/index.ts",
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "index.js"
      }
    }
  },
  ssr: {
    external: ["node-pty"],
    target: "node"
  }
})
