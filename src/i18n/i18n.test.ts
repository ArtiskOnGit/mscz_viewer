import { describe, expect, it } from 'vitest';
import { resources } from './index';

type Tree = { [key: string]: string | Tree };
const keys = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));

describe('i18n resources', () => {
  const reference = resources.en as unknown as Record<string, Tree>;
  for (const [lang, namespaces] of Object.entries(resources as unknown as Record<string, Record<string, Tree>>)) {
    it(`${lang} has exactly the same namespaces and keys as en`, () => {
      expect(Object.keys(namespaces).sort()).toEqual(Object.keys(reference).sort());
      for (const [ns, tree] of Object.entries(reference)) {
        expect(keys(namespaces[ns] ?? {}).sort(), `namespace ${ns}`).toEqual(keys(tree).sort());
      }
    });
  }

  it('has no empty English string', () => {
    for (const tree of Object.values(reference)) {
      const walk = (t: Tree): void => Object.values(t).forEach((v) => (typeof v === 'string' ? expect(v.trim()).not.toBe('') : walk(v)));
      walk(tree);
    }
  });
});
