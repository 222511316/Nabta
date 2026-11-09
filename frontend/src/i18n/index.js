import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

// Sprint 1 ships English only. Sprint 3 (US23) adds `ar` here plus a language
// switch; layout already uses logical CSS properties so it can flip to RTL.
export const resources = {
  en: { translation: en },
}

// Locales used for Intl date formatting, per UI language.
export const dateLocales = {
  en: 'en-GB',
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
})

function applyDocumentLanguage(language) {
  document.documentElement.lang = language
  document.documentElement.dir = i18n.dir(language)
}

applyDocumentLanguage(i18n.language)
i18n.on('languageChanged', applyDocumentLanguage)

export default i18n
