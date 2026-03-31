import { getLanguage, translate } from './i18n.js';

export async function applyDocumentTranslations(root = document) {
  const language = await getLanguage();
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    const message = translate(language, key);
    if (message) element.textContent = message;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    const message = translate(language, key);
    if (message) element.setAttribute('placeholder', message);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle;
    const message = translate(language, key);
    if (message) element.setAttribute('title', message);
  });
}
