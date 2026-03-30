const STORAGE_KEY = 'websuite.language';
const FALLBACK_LANGUAGE = 'pt-BR';

const dictionaries = {
  'pt-BR': {
    appTitle: 'WebSuite',
    workspace: 'Workspace',
    automation: 'Automation',
    privacy: 'Privacy',
    language: 'Idioma',
  },
  en: {
    appTitle: 'WebSuite',
    workspace: 'Workspace',
    automation: 'Automation',
    privacy: 'Privacy',
    language: 'Language',
  },
  es: {
    appTitle: 'WebSuite',
    workspace: 'Workspace',
    automation: 'Automation',
    privacy: 'Privacy',
    language: 'Idioma',
  },
};

export async function getLanguage() {
  const stored = await chrome.storage.local.get([STORAGE_KEY]);
  return stored?.[STORAGE_KEY] || FALLBACK_LANGUAGE;
}

export async function setLanguage(language) {
  await chrome.storage.local.set({ [STORAGE_KEY]: language });
  return language;
}

export function translate(language, key) {
  return dictionaries[language]?.[key] || dictionaries[FALLBACK_LANGUAGE]?.[key] || key;
}

export function getDictionary(language) {
  return dictionaries[language] || dictionaries[FALLBACK_LANGUAGE];
}
