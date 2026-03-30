import * as model from './lib/model.js';
const DEFAULT_DIRECTORY_NAME = 'Diretorio 1';

function createDefaultData() {
  return {
    directories: {
      Geral: [],
      [DEFAULT_DIRECTORY_NAME]: []
    },
    settings: {
      mergeDuplicates: true,
      theme: 'system',
      selectedDirectory: DEFAULT_DIRECTORY_NAME,
      masterPasswordHash: null,
      directoryOrder: []
    },
    trash: []
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
        id: 'add-site',
        title: chrome.i18n.getMessage('addSite') || 'Adicionar site da aba',
        contexts: ['page']
      });
    });
  } catch (error) {
    console.warn('Erro ao criar context menu', error);
  }
}

async function addSiteFromTab(tab) {
  if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) return;
  const settings = await model.getSettings();
  const virtualNames = ['Geral', chrome.i18n.getMessage('moreAccessed') || 'Mais acessados', chrome.i18n.getMessage('trash') || 'Lixeira'];
  const directoryNames = await model.getDirectoryNames();
  const firstUserDirectory = directoryNames.find((name) => !virtualNames.includes(name));
  if (!firstUserDirectory && virtualNames.includes(settings.selectedDirectory)) {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/48.png',
      title: 'Nenhum diretório disponível',
      message: 'Crie um diretório antes de adicionar favoritos pelo menu.'
    });
    return;
  }
  const directoryName = virtualNames.includes(settings.selectedDirectory)
    ? firstUserDirectory
    : (settings.selectedDirectory || firstUserDirectory);
  if (!directoryName) {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/48.png',
      title: 'Nenhum diretório disponível',
      message: 'Crie um diretório antes de adicionar favoritos pelo menu.'
    });
    return;
  }
  const site = {
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || ''
  };
  await model.addSite(directoryName, site, false);
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeData();
  createContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeData();
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-site') {
    await addSiteFromTab(tab);
  }
});
