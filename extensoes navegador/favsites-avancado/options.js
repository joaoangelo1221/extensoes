// options.js
// Lida com a página de configurações: tema, mesclar duplicados, importar/exportar.

import * as model from './lib/model.js';

// Localiza textos no DOM
function localize() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
}

function applyTheme(theme) {
  const html = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('dark', isDark);
}

document.addEventListener('DOMContentLoaded', async () => {
  localize();
  const themeSelect = document.getElementById('theme-select');
  const mergeDup = document.getElementById('merge-dup');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  const messageEl = document.getElementById('options-message');
  const settings = await model.getSettings();
  themeSelect.value = settings.theme || 'system';
  mergeDup.checked = settings.mergeDuplicates !== false;
  applyTheme(settings.theme);
  themeSelect.addEventListener('change', async () => {
    const val = themeSelect.value;
    await model.setSettings({ theme: val });
    applyTheme(val);
    messageEl.textContent = (chrome.i18n.getMessage('theme') || 'Tema') + ' ✔';
    setTimeout(() => (messageEl.textContent = ''), 2000);
  });
  mergeDup.addEventListener('change', async () => {
    await model.setSettings({ mergeDuplicates: mergeDup.checked });
    messageEl.textContent = (chrome.i18n.getMessage('mergeDuplicates') || 'Mesclar duplicados') + ' ✔';
    setTimeout(() => (messageEl.textContent = ''), 2000);
  });
  exportBtn.addEventListener('click', async () => {
    try {
      const json = await model.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'favoritos.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
      messageEl.textContent = chrome.i18n.getMessage('exportSuccess') || 'Exportação iniciada';
      setTimeout(() => (messageEl.textContent = ''), 2000);
    } catch (e) {
      messageEl.textContent = chrome.i18n.getMessage('importError') || 'Erro ao exportar';
    }
  });
  importBtn.addEventListener('click', () => {
    importFile.click();
  });
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await model.importData(data);
        messageEl.textContent = chrome.i18n.getMessage('importSuccess') || 'Importação concluída';
        setTimeout(() => (messageEl.textContent = ''), 2000);
      } catch (err) {
        messageEl.textContent = chrome.i18n.getMessage('importError') || 'Erro ao importar';
      }
    };
    reader.readAsText(file);
  });
});