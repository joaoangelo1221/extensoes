// lib/model.js
// Camada de modelo contendo as operaÃ§Ãµes de CRUD para diretÃ³rios e sites,
// bem como funÃ§Ãµes de alto nÃ­vel para lidar com destaques, notas,
// lembretes, credenciais. Depende de storage.js para persistÃªncia
// e crypto.js para criptografia de credenciais.

import { getData, setData, updateData } from './storage.js';
import { sha256, deriveKey, encrypt, decrypt } from './crypto.js';

const DEFAULT_DIRECTORY_NAME = 'Diretorio 1';

// Normaliza uma URL para deduplicaÃ§Ã£o (origem + pathname, sem query e hash)
function normalizedKey(url) {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/$/, '');
    return `${u.origin}${path}`;
  } catch (e) {
    return url;
  }
}

// Gera um identificador Ãºnico simples
function generateId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function ensureCredentialEntries(item) {
  if (!item) return [];
  if (Array.isArray(item.credentials)) return item.credentials;
  if (item.credentials && item.credentials.user && item.credentials.pass) {
    item.credentials = [{
      id: generateId(),
      label: 'Principal',
      user: item.credentials.user,
      pass: item.credentials.pass,
      lastUpdated: item.credentials.lastUpdated || Date.now()
    }];
    return item.credentials;
  }
  item.credentials = [];
  return item.credentials;
}

function getReservedDirectoryNames() {
  return [
    'Geral',
    chrome.i18n.getMessage('moreAccessed') || 'Mais acessados',
    chrome.i18n.getMessage('trash') || 'Lixeira'
  ];
}

function getWritableDirectoryName(name) {
  const reserved = getReservedDirectoryNames();
  return reserved.includes(name) ? DEFAULT_DIRECTORY_NAME : name;
}

function resolveWritableDirectoryName(data, name) {
  const reserved = getReservedDirectoryNames();
  if (!reserved.includes(name)) return name;
  const firstUserDirectory = Object.keys(data.directories || {}).find((dirName) => dirName !== 'Geral');
  return firstUserDirectory || null;
}

function syncDirectoryOrder(data) {
  data.settings = data.settings || {};
  if (!Array.isArray(data.settings.directoryOrder)) data.settings.directoryOrder = [];
  const validNames = Object.keys(data.directories || {}).filter((name) => name !== 'Geral');
  data.settings.directoryOrder = data.settings.directoryOrder.filter((name, index, list) => {
    return validNames.includes(name) && list.indexOf(name) === index;
  });
  validNames.forEach((name) => {
    if (!data.settings.directoryOrder.includes(name)) data.settings.directoryOrder.push(name);
  });
}

/**
 * Retorna uma lista com os nomes dos diretÃ³rios existentes.
 * â€œMais acessadosâ€ NÃƒO entra aqui (Ã© especial e a UI o adiciona Ã  parte).
 * â€œGeralâ€ Ã© sempre o primeiro da lista retornada.
 */
export async function getDirectoryNames() {
  const data = await getData();
  const names = Object.keys(data.directories || {});
  const specialName = chrome.i18n?.getMessage('moreAccessed') || 'Mais acessados';
  const filtered = names.filter((n) => n !== 'Geral' && n !== specialName);
  const order = data.settings?.directoryOrder || [];
  const ordered = filtered.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return ['Geral', ...ordered];
}

/** ConfiguraÃ§Ãµes */
export async function getSettings() {
  const data = await getData();
  data.settings = data.settings || {};
  if (data.settings.mergeDuplicates === undefined) data.settings.mergeDuplicates = true;
  if (!data.settings.theme) data.settings.theme = 'system';
  if (!data.settings.selectedDirectory) data.settings.selectedDirectory = DEFAULT_DIRECTORY_NAME;
  return data.settings;
}
export async function setSettings(partial) {
  const data = await getData();
  data.settings = Object.assign({}, data.settings, partial);
  await setData(data);
  return data.settings;
}

/** DiretÃ³rios */
async function ensureDirectory(name) {
  await updateData((data) => {
    if (!data.directories[name]) {
      data.directories[name] = [];
      syncDirectoryOrder(data);
    }
  });
}
export async function createDirectory(name) {
  name = name.trim();
  if (!name) throw new Error(chrome.i18n.getMessage('noDirectoryName') || 'Informe um nome para o diretÃ³rio.');
  const reserved = getReservedDirectoryNames();
  if (reserved.includes(name)) throw new Error('Nome de diretÃ³rio reservado.');
  const data = await getData();
  if (data.directories[name]) throw new Error(chrome.i18n.getMessage('directoryExists') || 'DiretÃ³rio jÃ¡ existe.');
  data.directories[name] = [];
  syncDirectoryOrder(data);
  await setData(data);
  return name;
}
export async function renameDirectory(oldName, newName) {
  newName = newName.trim();
  if (!newName) throw new Error(chrome.i18n.getMessage('noDirectoryName') || 'Informe um nome.');
  const data = await getData();
  if (oldName === 'Geral') throw new Error(chrome.i18n.getMessage('cannotRenameGeneral') || 'DiretÃ³rio Geral nÃ£o pode ser renomeado.');
  const special = chrome.i18n.getMessage('moreAccessed') || 'Mais acessados';
  if (oldName === special) throw new Error('DiretÃ³rio especial nÃ£o pode ser renomeado.');
  if (getReservedDirectoryNames().includes(newName)) throw new Error('Nome de diretÃ³rio reservado.');
  if (data.directories[newName]) throw new Error(chrome.i18n.getMessage('directoryExists') || 'JÃ¡ existe diretÃ³rio com esse nome.');
  const list = data.directories[oldName];
  delete data.directories[oldName];
  data.directories[newName] = list;
  if (data.settings.selectedDirectory === oldName) data.settings.selectedDirectory = newName;
  if (Array.isArray(data.settings.directoryOrder)) {
    data.settings.directoryOrder = data.settings.directoryOrder.map((name) => (name === oldName ? newName : name));
  }
  if (Array.isArray(data.trash)) {
    data.trash.forEach((entry) => {
      if (entry.originalDirectory === oldName) entry.originalDirectory = newName;
    });
  }
  syncDirectoryOrder(data);
  await setData(data);
  return newName;
}
export async function deleteDirectory(name) {
  if (name === 'Geral') throw new Error(chrome.i18n.getMessage('cannotDeleteGeneral') || 'Diretório Geral não pode ser excluído.');
  const special = chrome.i18n.getMessage('moreAccessed') || 'Mais acessados';
  if (name === special) throw new Error('Diretório especial não pode ser excluído.');
  await updateData((data) => {
    const userDirectories = Object.keys(data.directories || {}).filter((dirName) => dirName !== 'Geral' && dirName !== name);
    const fallbackDirectory = userDirectories[0] || null;
    if (fallbackDirectory) {
      data.directories[fallbackDirectory] = Array.isArray(data.directories[fallbackDirectory]) ? data.directories[fallbackDirectory] : [];
    }
    const removedItems = Array.isArray(data.directories[name]) ? data.directories[name] : [];
    if (removedItems.length && fallbackDirectory) {
      removedItems.forEach((item) => {
        item.updatedAt = Date.now();
        data.directories[fallbackDirectory].push(item);
      });
    }
    delete data.directories[name];
    if (data.settings.selectedDirectory === name) data.settings.selectedDirectory = fallbackDirectory || 'Geral';
    if (Array.isArray(data.trash)) {
      data.trash.forEach((entry) => {
        if (entry.originalDirectory === name) entry.originalDirectory = fallbackDirectory || 'Geral';
      });
    }
    syncDirectoryOrder(data);
  });
  return true;
}
/** Sites */
export async function addSite(directory, site, forceAdd = false) {
  let result = { status: 'duplicate' };
  await updateData((data) => {
    directory = resolveWritableDirectoryName(data, directory);
    if (!directory) {
      throw new Error('Crie um diretório antes de adicionar favoritos.');
    }
    data.directories[directory] = Array.isArray(data.directories[directory]) ? data.directories[directory] : [];
    syncDirectoryOrder(data);

    const list = data.directories[directory];
    const key = normalizedKey(site.url);
    const idx = list.findIndex((item) => normalizedKey(item.url) === key);
    const mergeDuplicates = data.settings.mergeDuplicates !== false;

    if (idx >= 0) {
      if (!mergeDuplicates && !forceAdd) {
        result = { status: 'duplicate' };
        return;
      }
      if (mergeDuplicates) {
        const existing = list[idx];
        existing.visitCount = (existing.visitCount || 0) + 1;
        existing.updatedAt = Date.now();
        existing.title = site.title;
        if (site.favicon) existing.favicon = site.favicon;
        result = { status: 'merged', item: { ...existing } };
        return;
      }
    }

    const newItem = {
      id: generateId(),
      title: site.title,
      url: site.url,
      favicon: site.favicon || '',
      pinned: false,
      highlight: '',
      notes: '',
      reminders: [],
      credentials: [],
      visitCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    list.push(newItem);
    result = { status: 'added', item: { ...newItem } };
  });
  return result;
}
export async function togglePinned(directory, itemId) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir.find((i) => i.id === itemId);
    if (item) {
      item.pinned = !item.pinned;
      item.updatedAt = Date.now();
      const pinned = dir.filter((i) => i.pinned);
      const others = dir.filter((i) => !i.pinned);
      data.directories[directory] = [...pinned, ...others];
    }
  });
}
export async function moveItem(fromDir, toDir, itemId) {
  if (fromDir === toDir) return;
  await updateData((data) => {
    const src = data.directories[fromDir];
    const dst = data.directories[toDir] || [];
    if (!Array.isArray(src)) return;
    const idx = src.findIndex((i) => i.id === itemId);
    if (idx >= 0) {
      const [item] = src.splice(idx, 1);
      item.updatedAt = Date.now();
      dst.push(item);
      data.directories[toDir] = dst;
    }
  });
}
export async function reorderItem(directory, fromIndex, toIndex) {
  await updateData((data) => {
    const dir = data.directories[directory];
    if (!dir) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= dir.length || toIndex >= dir.length) return;
    const [item] = dir.splice(fromIndex, 1);
    dir.splice(toIndex, 0, item);
    const pinned = dir.filter((i) => i.pinned);
    const others = dir.filter((i) => !i.pinned);
    data.directories[directory] = [...pinned, ...others];
  });
}
export async function incrementVisitCount(directory, itemId) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item) {
      item.visitCount = (item.visitCount || 0) + 1;
      item.updatedAt = Date.now();
    }
  });
}
export async function updateNote(directory, itemId, notes) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item) {
      item.notes = notes || '';
      item.updatedAt = Date.now();
    }
  });
}
export async function setHighlight(directory, itemId, highlight) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item) {
      item.highlight = highlight || '';
      item.updatedAt = Date.now();
    }
  });
}

/** Lembretes */
export async function addReminder(directory, itemId, date, note) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item) {
      if (!Array.isArray(item.reminders)) item.reminders = [];
      item.reminders.push({ date, note });
      item.updatedAt = Date.now();
    }
  });
}
export async function removeReminder(directory, itemId, index) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item && Array.isArray(item.reminders) && index >= 0 && index < item.reminders.length) {
      item.reminders.splice(index, 1);
      item.updatedAt = Date.now();
    }
  });
}

/** Credenciais */
export async function addCredential(directory, itemId, label, user, password, masterPassword) {
  await updateData(async (data) => {
    if (!data.settings.masterPasswordHash) {
      data.settings.masterPasswordHash = await sha256(masterPassword);
    }
    const hashCheck = await sha256(masterPassword);
    if (data.settings.masterPasswordHash !== hashCheck) {
      throw new Error('Senha mestre incorreta.');
    }
    const key = await deriveKey(masterPassword);
    const encUser = await encrypt(user, key);
    const encPass = await encrypt(password, key);
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (item) {
      const entries = ensureCredentialEntries(item);
      entries.push({
        id: generateId(),
        label: (label || '').trim(),
        user: encUser,
        pass: encPass,
        lastUpdated: Date.now()
      });
      item.updatedAt = Date.now();
    }
    return data;
  });
}
export async function setCredentials(directory, itemId, user, password, masterPassword) {
  return addCredential(directory, itemId, '', user, password, masterPassword);
}
export async function getCredentials(directory, itemId, masterPassword) {
  const data = await getData();
  if (!data.settings.masterPasswordHash) throw new Error('Nenhuma senha mestre definida.');
  const hashCheck = await sha256(masterPassword);
  if (data.settings.masterPasswordHash !== hashCheck) throw new Error('Senha mestre incorreta.');
  const key = await deriveKey(masterPassword);
  const item = data.directories[directory]?.find((i) => i.id === itemId);
  if (!item) return [];
  const entries = ensureCredentialEntries(item);
  const decryptedEntries = [];
  for (const entry of entries) {
    decryptedEntries.push({
      id: entry.id || generateId(),
      label: entry.label || '',
      user: await decrypt(entry.user, key),
      pass: await decrypt(entry.pass, key),
      lastUpdated: entry.lastUpdated || null
    });
  }
  return decryptedEntries;
}
export async function removeCredential(directory, itemId, credentialId) {
  await updateData((data) => {
    const dir = data.directories[directory];
    const item = dir && dir.find((i) => i.id === itemId);
    if (!item) return;
    const entries = ensureCredentialEntries(item);
    const index = entries.findIndex((entry) => entry.id === credentialId);
    if (index >= 0) {
      entries.splice(index, 1);
      item.updatedAt = Date.now();
    }
  });
}

/** Reordenar diretÃ³rios (arrastar guias) */
export async function reorderDirectories(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  await updateData((data) => {
    const special = chrome.i18n?.getMessage('moreAccessed') || 'Mais acessados';
    const names = Object.keys(data.directories || {}).filter((n) => n !== 'Geral' && n !== special);
    if (!Array.isArray(data.settings.directoryOrder) || data.settings.directoryOrder.length === 0) {
      data.settings.directoryOrder = names.slice();
    }
    const order = data.settings.directoryOrder;
    names.forEach((n) => { if (!order.includes(n)) order.push(n); });
    for (let i = order.length - 1; i >= 0; i--) {
      if (!names.includes(order[i])) order.splice(i, 1);
    }
    const dir = order.splice(fromIndex, 1)[0];
    order.splice(toIndex, 0, dir);
  });
}

/** Renomear apenas o tÃ­tulo do site (nÃ£o altera URL) */
export async function renameSite(directory, itemId, newTitle) {
  await updateData((data) => {
    const list = data.directories[directory];
    const item = list && list.find((i) => i.id === itemId);
    if (item) {
      item.title = newTitle || item.title;
      item.updatedAt = Date.now();
    }
  });
}

/** Lixeira */
export async function removeSite(directory, itemId, toTrash = true) {
  await updateData((data) => {
    const list = data.directories[directory];
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((i) => i.id === itemId);
    if (idx >= 0) {
      const [item] = list.splice(idx, 1);
      if (toTrash) {
        if (!Array.isArray(data.trash)) data.trash = [];
        data.trash.push({ id: generateId(), item, originalDirectory: directory, deletedAt: Date.now() });
      }
    }
  });
}
export async function removeSites(directory, itemIds, toTrash = true) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return;
  await updateData((data) => {
    const list = data.directories[directory];
    if (!Array.isArray(list)) return;
    if (!Array.isArray(data.trash)) data.trash = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (itemIds.includes(item.id)) {
        list.splice(i, 1);
        if (toTrash) {
          data.trash.push({ id: generateId(), item, originalDirectory: directory, deletedAt: Date.now() });
        }
      }
    }
  });
}
export async function getTrash() {
  const data = await getData();
  return data.trash || [];
}
export async function restoreFromTrash(trashId) {
  await updateData((data) => {
    if (!Array.isArray(data.trash)) return;
    const idx = data.trash.findIndex((t) => t.id === trashId);
    if (idx < 0) return;
    const { item, originalDirectory } = data.trash[idx];
    data.trash.splice(idx, 1);
    const firstUserDirectory = Object.keys(data.directories || {}).find((dirName) => dirName !== 'Geral');
    const targetDirectory = !originalDirectory || originalDirectory === 'Geral'
      ? (firstUserDirectory || DEFAULT_DIRECTORY_NAME)
      : originalDirectory;
    if (!data.directories[targetDirectory]) data.directories[targetDirectory] = [];
    data.directories[targetDirectory].push(item);
    item.updatedAt = Date.now();
    syncDirectoryOrder(data);
  });
}
export async function permanentlyDeleteTrash(trashIds) {
  if (!Array.isArray(trashIds) || trashIds.length === 0) return;
  await updateData((data) => {
    if (!Array.isArray(data.trash)) return;
    data.trash = data.trash.filter((t) => !trashIds.includes(t.id));
  });
}
export async function clearExpiredTrash(days = 15) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  await updateData((data) => {
    if (!Array.isArray(data.trash)) return;
    data.trash = data.trash.filter((t) => t.deletedAt >= cutoff);
  });
}

/** Utilidades */
export async function getTopVisited(limit = 12) {
  const data = await getData();
  const items = [];
  for (const [dirName, list] of Object.entries(data.directories)) {
    if (dirName === 'Geral') continue;
    for (const item of list) {
      items.push({ ...item, directory: dirName });
    }
  }
  items.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
  return items.slice(0, limit);
}
export async function exportData() {
  const data = await getData();
  return JSON.stringify(data, null, 2);
}
export async function getAllItems() {
  const data = await getData();
  const items = [];
  for (const [dirName, list] of Object.entries(data.directories)) {
    if (dirName === 'Geral') continue;
    for (const item of list) {
      items.push({ ...item, directory: dirName });
    }
  }
  return items;
}
export async function importData(jsonData) {
  if (!jsonData || typeof jsonData !== 'object') throw new Error('Dados invÃ¡lidos');
  if (!jsonData.directories || !jsonData.settings) throw new Error('Estrutura invÃ¡lida');
  if (!jsonData.directories['Geral']) jsonData.directories['Geral'] = [];
  await setData(jsonData);
}

// Reexporta funÃ§Ãµes bÃ¡sicas de storage
export { getData, setData, updateData } from './storage.js';


