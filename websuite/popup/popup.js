import { getLanguage, setLanguage, translate } from '../core/i18n.js';

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

function applyShellTranslations(language) {
  document.getElementById('app-title').textContent = translate(language, 'appTitle');
  document.getElementById('language-label').textContent = translate(language, 'language');
  document.getElementById('tab-workspace').textContent = translate(language, 'workspace');
  document.getElementById('tab-automation').textContent = translate(language, 'automation');
  document.getElementById('tab-privacy').textContent = translate(language, 'privacy');
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

languageSelect.addEventListener('change', async () => {
  const language = languageSelect.value;
  await setLanguage(language);
  applyShellTranslations(language);
});

const language = await getLanguage();
languageSelect.value = language;
applyShellTranslations(language);
setActiveTab('workspace');
