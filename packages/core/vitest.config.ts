import { defineConfig } from "vitest/config";

// Exclude the compiled `bin/` output (produced by `tsc`) so vitest only runs
// the source `.test.ts` files. Without this, vitest also picks up the emitted
// CommonJS `bin/**/*.test.js` files, which fail to import vitest under
// `require()`. `bin/` is gitignored build output, not test source.
export default defineConfig({
  test: {
    exclude: ["**/bin/**", "**/node_modules/**", "**/dist/**"],
  },
});
