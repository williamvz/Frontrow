import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import nl from './nl.js';
import en from './en.js';

const BUNDLES = { nl, en };
const I18nContext = createContext({ t: (k) => k, locale: 'nl', setLocale: () => {} });

/** Look up a dotted key, falling back to Dutch and then to the key itself. */
function lookup(bundle, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), bundle);
}

export function I18nProvider({ children, initialLocale = 'nl' }) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const value = useMemo(() => {
    const bundle = BUNDLES[locale] || nl;
    const t = (key, vars) => {
      const raw = lookup(bundle, key) ?? lookup(nl, key) ?? key;
      if (typeof raw !== 'string' || !vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
    };
    // Arrays (weekday names, months) are looked up whole.
    const list = (key) => lookup(bundle, key) ?? lookup(nl, key) ?? [];
    return { t, list, locale, setLocale, bundle };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => useContext(I18nContext);
