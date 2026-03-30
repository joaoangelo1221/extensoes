import { registerHandlers } from '../../core/messaging.js';
import * as model from './data/workspace-model.js';

const DEFAULT_DIRECTORY_NAME = 'Diretorio 1';

function createDefaultData() {
  return {
    directories: {
      Geral: [],
      [DEFAULT_DIRECTORY_NAME]: [],
    },
    settings: {
      mergeDuplicates: true,
      theme: 'system',
      selectedDirectory: DEFAULT_DIRECTORY_NAME,
      masterPasswordHash: null,
      directoryOrder: [],
    },
    trash: [],
  };
}

async function initializeData() {
  const current = await model.getData();
  if (!current.directories || Object.keys(current.directories).length === 0) {
    await model.importData(createDefaultData());
  }
  await model.clearExpiredTrash(15);
}

function createContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'websuite-add-site',
        title: chrome.i18n.getMessage('contextAddCurrentSite') || 'Adicionar site ao Workspace',
        contexts: ['page'],
      });
    });
  } catch {}
}

async function addSiteFromTab(tab) {
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) return { ok: false, error: 'Aba inválida.' };
  const settings = await model.getSettings();
  const virtualNames = ['Geral', chrome.i18n.getMessage('moreAccessed') || 'Mais acessados', chrome.i18n.getMessage('trash') || 'Lixeira'];
  const directoryNames = await model.getDirectoryNames();
  const firstUserDirectory = directoryNames.find((name) => !virtualNames.includes(name));
  const directoryName = virtualNames.includes(settings.selectedDirectory)
    ? firstUserDirectory
    : (settings.selectedDirectory || firstUserDirectory);
  if (!directoryName) {
    return { ok: false, error: 'Crie um diretório antes de adicionar favoritos.' };
  }
  await model.addSite(directoryName, {
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || '',
  }, false);
  return { ok: true };
}

export async function initializeWorkspaceModule() {
  await initializeData();
  createContextMenu();
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'websuite-add-site') {
      await addSiteFromTab(tab);
    }
  });

  registerHandlers({
    'WORKSPACE/ADD_ACTIVE_TAB': async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return addSiteFromTab(tab);
    },
  });
}
