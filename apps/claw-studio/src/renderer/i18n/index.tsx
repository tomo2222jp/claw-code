import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";

import { en } from "./en.js";
import { ja } from "./ja.js";

const messages = { ja, en };

export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof en;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = PropsWithChildren<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>;

export function I18nProvider({ children, locale, setLocale }: I18nProviderProps) {

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t: (key) => messages[locale][key],
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
