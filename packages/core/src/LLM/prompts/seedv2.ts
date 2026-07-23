import fs from 'fs';
import path from 'path';

/**
 * Load the v2 Seed Prompt from the markdown file.
 * The prompt file lives at the monorepo root (prompts/seed-v2.md).
 *
 * We resolve it relative to the core package's own directory so it works
 * both in dev (ts-node) and after Docker build (compiled JS).
 */
let _cached: string | null = null;

export function loadSeedV2(): string {
  if (_cached) return _cached;
  // packages/core/src/LLM/prompts/seedv2.ts -> project root
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const filePath = path.join(root, 'prompts', 'seed-v2.md');
  _cached = fs.readFileSync(filePath, 'utf-8');
  return _cached;
}

/**
 * Clear the cached prompt (useful for hot-reload in dev).
 */
export function clearSeedV2Cache(): void {
  _cached = null;
}
