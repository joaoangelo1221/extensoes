import { getLanguage, setLanguage } from '../core/i18n.js';
import { applyDocumentTranslations } from '../core/i18n-dom.js';

const tabs = {
  workspace: '../modules/workspace/ui/workspace-panel.html',
  automation: '../modules/automation/ui/automation-panel.html',
  privacy: '../modules/privacy/ui/privacy-panel.html',
};

const frame = document.getElementById('module-frame');
const languageSelect = document.getElementById('language-select');

function setActiveTab(tabName) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  frame.src = tabs[tabName];
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

languageSelect.addEventListener('change', async () => {
  const language = languageSelect.value;
  await setLanguage(language);
  await applyDocumentTranslations(document);
  frame.src = tabs[document.querySelector('.tab.active')?.dataset.tab || 'workspace'];
});

const language = await getLanguage();
languageSelect.value = language;
await applyDocumentTranslations(document);
setActiveTab('workspace');
