import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const appDir = path.join(root, 'app');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function routeOf(file: string): string {
  const rel = path.relative(appDir, file).replace(/\.tsx?$/, '');
  const parts = rel
    .split(path.sep)
    .filter((part) => !/^\(.*\)$/.test(part) && part !== 'index');
  return `/${parts.join('/')}`;
}

const screens = walk(appDir).filter((file) => !path.basename(file).startsWith('_'));
const routes = screens.map(routeOf);

function resolves(href: string): boolean {
  const clean = href.split('?')[0].replace(/\/\([^)]+\)/g, '').replace(/\/$/, '') || '/';
  return routes.some((route) => new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(clean));
}

const sources = [...walk(appDir), ...walk(path.join(root, 'src'))];
const linkPattern =
  /(?:router\.(?:push|replace)\(\s*[`'"]|href=\{?\s*[`'"]|pathname:\s*'|screen:\s*'|path:\s*'|go\('|: ')(\/[^`'"]*)/g;

function readSource(file: string) {
  return fs.readFileSync(file, 'utf8');
}

describe('app navigation', () => {
  it('every internal link points at a real screen', () => {
    const broken: string[] = [];
    for (const file of sources) {
      for (const match of readSource(file).matchAll(linkPattern)) {
        if (match[1].includes('${')) continue;
        if (!resolves(match[1])) broken.push(`${path.relative(root, file)} → ${match[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('keeps the bottom bar to four tabs', () => {
    const layout = readSource(path.join(appDir, '(tabs)', '_layout.tsx'));
    const visible = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"(?![^>]*href: null)/g)].map((m) => m[1]);
    expect(visible).toEqual(['index', 'sale', 'stock', 'more']);
  });

  it('every business screen is reachable from a tab, menu or shortcut', () => {
    const linked = new Set<string>();
    for (const file of sources) {
      for (const match of readSource(file).matchAll(linkPattern)) linked.add(match[1].split('?')[0]);
    }
    const more = readSource(path.join(appDir, '(tabs)', 'more', 'index.tsx'));
    for (const screen of more.matchAll(/screen: '([a-z-]+)'/g)) {
      expect(resolves(`/more/${screen[1]}`)).toBe(true);
      linked.add(`/more/${screen[1]}`);
    }

    const required = [
      '/sale',
      '/stock',
      '/stock-in',
      '/stock-movements',
      '/stock-report',
      '/reorder',
      '/expense',
      '/closing',
      '/customers',
      '/suppliers',
      '/payment/customer-payment',
      '/payment/supplier-payment',
      '/reports',
      '/waiter-tabs',
      '/more/business-settings',
      '/more/user-management',
      '/more/audit',
      '/more/sync',
      '/more/help',
      '/more/about',
      '/more/change-pin',
    ];
    const tabs = ['/sale', '/stock'];
    const missing = required.filter((route) => !tabs.includes(route) && ![...linked].some((href) => href === route || href.endsWith(route)));
    expect(missing).toEqual([]);
  });
});
