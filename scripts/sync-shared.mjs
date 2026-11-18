#!/usr/bin/env node
// Copies the app's pure money and stock maths into backend/src/shared so the API runs the exact same code.
// Run `npm run shared:sync` after changing a source file. __tests__/sharedCopies.test.ts fails when a copy is stale.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SHARED_FILES = [
  { from: 'src/services/financial/calculations.ts', to: 'backend/src/shared/calculations.ts' },
  { from: 'src/services/books/waiterAllocation.ts', to: 'backend/src/shared/waiterAllocation.ts' },
  {
    from: 'src/services/books/stockDelta.ts',
    to: 'backend/src/shared/stockDelta.ts',
    replace: [
      [
        "import { StockMovementType } from '@/types';",
        "export type StockMovementType =\n  | 'opening'\n  | 'purchase'\n  | 'sale'\n  | 'return_in'\n  | 'return_out'\n  | 'adjustment_in'\n  | 'adjustment_out'\n  | 'damaged';",
      ],
    ],
  },
];

export function sharedCopy(file) {
  let text = readFileSync(join(root, file.from), 'utf8');
  for (const [find, replaceWith] of file.replace ?? []) {
    if (!text.includes(find)) throw new Error(`${file.from}: expected to find ${find}`);
    text = text.replace(find, replaceWith);
  }
  if (/from '@\//.test(text)) throw new Error(`${file.from} imports app-only code; the backend cannot use it`);
  return `// Generated from ${file.from} by \`npm run shared:sync\`. Do not edit here.\n${text}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--check')) {
  const stale = SHARED_FILES.filter((file) => {
    try {
      return readFileSync(join(root, file.to), 'utf8') !== sharedCopy(file);
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(`Out of date: ${stale.map((file) => file.to).join(', ')}. Run npm run shared:sync.`);
    process.exit(1);
  }
  console.log('Shared copies are up to date.');
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of SHARED_FILES) {
    const target = join(root, file.to);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sharedCopy(file));
    console.log(`${file.from} -> ${file.to}`);
  }
}
