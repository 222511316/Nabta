import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

// US23: English and Arabic. Layout uses logical CSS properties (ms-, pe-, start-…),
// so switching to Arabic flips the whole interface to right-to-left.
export const resources = {
  en: { translation: en },
  ar: { translation: ar },
}

export const LANGUAGES = ['en', 'ar']
const STORAGE_KEY = 'nabta.language'

// Locales used for Intl date and number formatting, per UI language. Arabic keeps the
// Gregorian calendar, the one the grower's records use, and the same digits as the
// counts in the interface text (0–9), so a page never mixes two sets of numerals.
export const dateLocales = {
  en: 'en-GB',
  ar: 'ar-SA-u-ca-gregory-nu-latn',
}

/** The Intl locale for a UI language. */
export const localeFor = (language) => dateLocales[language] ?? language

function storedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(saved) ? saved : null
  } catch {
    return null // storage blocked: fall back to the browser's language
  }
}

function browserLanguage() {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

/** Switches the interface language and remembers the choice in this browser. */
export function setLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Not remembered, but the switch still works for this visit.
  }
  return i18n.changeLanguage(language)
}

i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
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
