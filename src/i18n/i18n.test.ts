import { describe, expect, it } from 'vitest';
import i18n, { detectLanguage, resolveLanguage, resources } from './index';

type Tree = { [key: string]: string | Tree };
const keys = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
const values = (tree: Tree): string[] => Object.values(tree).flatMap((v) => (typeof v === 'string' ? [v] : values(v)));

// i18next plural keys: "key_one", "key_other"… The categories depend on the language (Intl.PluralRules):
// English has one/other, French one/many/other. A missing category falls back to "_other" (i18next ≥ 21).
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (key: string) => key.replace(PLURAL, '');
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();

/** Plural suffixes per base key. */
function pluralForms(tree: Tree): Map<string, Set<string>> {
  const forms = new Map<string, Set<string>>();
  for (const key of keys(tree)) {
    const m = PLURAL.exec(key);
    if (m) forms.set(base(key), (forms.get(base(key)) ?? new Set()).add(m[1]!));
  }
  return forms;
}

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

describe('i18n resources', () => {
  const reference = resources.en as unknown as Record<string, Tree>;
  for (const [lang, namespaces] of Object.entries(resources as unknown as Record<string, Record<string, Tree>>)) {
    const categories = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories as string[]);

    it(`${lang} has the same namespaces and keys as en (plural forms aside)`, () => {
      expect(Object.keys(namespaces).sort()).toEqual(Object.keys(reference).sort());
      for (const [ns, tree] of Object.entries(reference)) {
        const unique = (t: Tree) => [...new Set(keys(t).map(base))].sort();
        expect(unique(namespaces[ns] ?? {}), `namespace ${ns}`).toEqual(unique(tree));
      }
    });

    it(`${lang} plural keys use the plural categories of the language`, () => {
      for (const [ns, tree] of Object.entries(namespaces)) {
        const englishPlurals = pluralForms(reference[ns]!);
        for (const [key, forms] of pluralForms(tree)) {
          expect(englishPlurals.has(key), `${ns}:${key} is plural in en too`).toBe(true);
          for (const form of forms) expect(categories.has(form) || form === 'zero', `${ns}:${key}_${form} (${lang})`).toBe(true);
          expect(forms.has('other'), `${ns}:${key}_other`).toBe(true);
          if (categories.has('one')) expect(forms.has('one'), `${ns}:${key}_one`).toBe(true);
        }
        for (const key of englishPlurals.keys()) expect(pluralForms(tree).has(key), `${ns}:${key} is plural in ${lang}`).toBe(true);
      }
    });

    it(`${lang} keeps the placeholders of en`, () => {
      for (const [ns, tree] of Object.entries(namespaces)) {
        for (const key of keys(tree)) {
          const english = lookup(reference[ns]!, key) ?? lookup(reference[ns]!, `${base(key)}_other`)!;
          expect(placeholders(lookup(tree, key)!), `${ns}:${key}`).toEqual(placeholders(english));
        }
      }
    });

    it(`${lang} has no empty string`, () => {
      for (const tree of Object.values(namespaces)) for (const v of values(tree)) expect(v.trim()).not.toBe('');
    });
  }

  it('French typography: non-breaking space before « : ; ! ? % » and inside French quotes', () => {
    for (const [ns, tree] of Object.entries(resources.fr as unknown as Record<string, Tree>)) {
      for (const v of values(tree)) {
        expect(v, `${ns}: ${v}`).not.toMatch(/ [:;!?%»]/); // ordinary space before a high sign
        expect(v, `${ns}: ${v}`).not.toMatch(/« /);
        expect(v, `${ns}: ${v}`).not.toMatch(/[^\s\u00a0\u202f(]["“”]/); // English quotes
      }
    }
  });
});

describe('language selection', () => {
  it('follows the first supported device language, else English', () => {
    expect(detectLanguage(['fr-FR', 'en-US'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'fr-CA'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'it'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(resolveLanguage('system', ['fr'])).toBe('fr');
    expect(resolveLanguage('en', ['fr'])).toBe('en');
    expect(resolveLanguage('fr', ['en-US'])).toBe('fr');
  });

  it('resolves French plurals (0 and 1 are singular)', () => {
    const fr = i18n.getFixedT('fr', 'library');
    expect(fr('card.parts', { count: 0 })).toBe('0 instrument');
    expect(fr('card.parts', { count: 1 })).toBe('1 instrument');
    expect(fr('card.parts', { count: 2 })).toBe('2 instruments');
    expect(fr('card.parts', { count: 1000000 })).toBe('1000000 instruments'); // "many" falls back to "other"
    const en = i18n.getFixedT('en', 'library');
    expect(en('card.parts', { count: 0 })).toBe('0 instruments');
  });
});
