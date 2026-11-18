import { execFileSync } from 'child_process';
import path from 'path';

describe('backend shared maths', () => {
  it('matches the app source files', () => {
    const script = path.join(__dirname, '..', 'scripts', 'sync-shared.mjs');
    expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
