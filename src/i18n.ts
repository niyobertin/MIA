import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { en } from '@/translations/en';
import { rw } from '@/translations/rw';

const resources = {
  en: { translation: en },
  rw: { translation: rw },
};

const getDeviceLanguage = (): 'en' | 'rw' => {
  const locales = Localization.getLocales();
  if (locales.length > 0) {
    const lang = locales[0].languageCode;
    if (lang === 'rw') return 'rw';
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;