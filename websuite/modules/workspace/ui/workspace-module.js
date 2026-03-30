// popup.js
// Script principal para o popup avanÃ§ado. Controla a renderizaÃ§Ã£o de diretÃ³rios
// e itens, bem como as interaÃ§Ãµes do usuÃ¡rio para adicionar, remover,
// fixar, mover, notas, destaques, lembretes, credenciais e capturas de tela.

import * as model from '../data/workspace-model.js';
import {
  showToast,
  showConfirm,
  showPrompt,
  showTextModal,
  showReminderModal,
  showCredentialsModal
} from './workspace-ui.js';

// Nome do diretÃ³rio especial de mais acessados (cacheado)
const MORE_ACCESSED_NAME = chrome.i18n.getMessage('moreAccessed') || 'Mais acessados';

// Nome da lixeira
const TRASH_NAME = chrome.i18n.getMessage('trash') || 'Lixeira';

// Estado global
let selectedDirectory = 'Diretorio 1';
let searchQuery = '';
let currentMenu = null; // Menu suspenso atualmente aberto
// Estado de seleÃ§Ã£o mÃºltipla
let selectMode = false;
let selectedItems = new Set();

function hasFilledNote(item) {
  return Boolean(item?.notes && item.notes.trim());
}

function hasFilledReminders(item) {
  return Array.isArray(item?.reminders) && item.reminders.length > 0;
}

function hasFilledCredentials(item) {
  if (Array.isArray(item?.credentials)) return item.credentials.length > 0;
  return Boolean(item?.credentials?.user && item?.credentials?.pass);
}

async function openNoteEditor(item) {
  const newNote = await showTextModal(chrome.i18n.getMessage('editNote') || 'Editar anotação', item.notes || '', 1000);
  if (newNote !== null) {
    await model.updateNote(item.directory, item.id, newNote);
    showToast(chrome.i18n.getMessage('noteSaved') || 'Anotação salva.', 'success');
    await renderItems();
  }
}

async function openReminderCreator(item) {
  const result = await showReminderModal(chrome.i18n.getMessage('addReminder') || 'Adicionar lembrete');
  if (result) {
    try {
      await model.addReminder(item.directory, item.id, result.date, result.note || '');
      showToast(chrome.i18n.getMessage('reminderSaved') || 'Lembrete salvo.', 'success');
      await renderItems();
    } catch (err) {
      showToast(err.message || 'Erro', 'error');
    }
  }
}

async function openCredentialCreator(item, masterPassword = null) {
  const settings = await model.getSettings();
  const hasMaster = !!settings.masterPasswordHash;
  const result = await showCredentialsModal(hasMaster);
  if (!result) return;
  try {
    await model.addCredential(
      item.directory,
      item.id,
      result.label || '',
      result.user,
      result.pass,
      masterPassword || result.masterPassword
    );
    showToast(chrome.i18n.getMessage('credentialsSaved') || 'Credenciais salvas.', 'success');
    await renderItems();
    if (masterPassword) {
      await showCredentialsView(item, masterPassword);
    }
  } catch (err) {
    showToast(err.message || 'Erro ao salvar credenciais', 'error');
  }
}

// Atualiza estado do botÃ£o de adicionar conforme diretÃ³rio selecionado
function updateAddButtonState() {
  const addBtn = document.getElementById('add-site');
  if (!addBtn) return;
  // Desabilita adicionar apenas em Ã¡reas virtuais.
  const disabled = selectedDirectory === 'Geral' || selectedDirectory === MORE_ACCESSED_NAME || selectedDirectory === TRASH_NAME;
  addBtn.disabled = disabled;
  addBtn.classList.toggle('disabled', disabled);
}

// Atualiza visibilidade e textos dos controles de seleÃ§Ã£o mÃºltipla
function updateMultiSelectControls() {
  const selectToggle = document.getElementById('toggle-select');
  const delSelected = document.getElementById('delete-selected');
  const restoreSelected = document.getElementById('restore-selected');
  if (!selectToggle || !delSelected) return;
  // Atualiza texto do botão de alternar seleção
  if (selectMode) {
    selectToggle.textContent = chrome.i18n.getMessage('cancelSelect') || 'Cancelar seleção';
  } else {
    selectToggle.textContent = chrome.i18n.getMessage('select') || 'Selecionar';
  }
  // Mostra ou oculta botões de ação dependendo do contexto
  const anySelected = selectedItems.size > 0;
  delSelected.style.display = selectMode && !anySelected ? 'none' : selectMode ? 'inline-flex' : 'none';
  if (restoreSelected) {
    restoreSelected.style.display = selectMode && selectedDirectory === TRASH_NAME && anySelected ? 'inline-flex' : 'none';
  }
}

// InicializaÃ§Ã£o
document.addEventListener('DOMContentLoaded', async () => {
  await localizeStrings();
  const settings = await model.getSettings();
  selectedDirectory = settings.selectedDirectory || 'Diretorio 1';
  applyTheme(settings.theme);
  await renderDirectories();
  await renderItems();
  setupEventHandlers();

  // A funcionalidade de captura de print foi removida. Nenhuma mensagem global Ã© tratada aqui.
});

/**
 * Localiza elementos com atributo data-i18n e substitui pelo valor
 * correspondente em messages.json.
 */
async function localizeStrings() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  // Placeholder da busca
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.placeholder = chrome.i18n.getMessage('search') || 'Buscar...';
  }
  // TÃ­tulo da pÃ¡gina
  document.title = chrome.i18n.getMessage('extensionName') || document.title;
}

/**
 * Aplica tema salvo (light/dark/system). Ajusta classe na raiz.
 * @param {string} theme
 */
function applyTheme(theme) {
  const html = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('dark', isDark);
}

/**
 * Renderiza lista de diretÃ³rios e tab especial. MantÃ©m ordem e
 * adiciona handlers de clique e menu de contexto.
 */
async function renderDirectories() {
  const container = document.getElementById('directories');
  container.innerHTML = '';
  const names = await model.getDirectoryNames();
  // 'names' jÃ¡ vem ordenado a partir de model.getDirectoryNames()
  // Cria guia para cada diretÃ³rio. Habilita drag apenas para diretÃ³rios de usuÃ¡rio
  names.forEach((name, idx) => {
    const tab = document.createElement('div');
    tab.className = 'directory-tab';
    tab.textContent = name;
    tab.dataset.name = name;
    // Determina se Ã© diretÃ³rio de usuÃ¡rio
    const isUserDir = name !== 'Geral' && name !== MORE_ACCESSED_NAME && name !== TRASH_NAME;
    // Atribui Ã­ndice relativo em names (comeÃ§ando apÃ³s Geral)
    tab.dataset.index = idx;
    if (name === selectedDirectory) tab.classList.add('active');
    tab.addEventListener('click', async () => {
      selectedDirectory = name;
      await model.setSettings({ selectedDirectory: name });
      await renderDirectories();
      await renderItems();
    });
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showDirectoryContextMenu(name, e.clientX, e.clientY);
    });
    // Permite arrastar item sobre guia para mover itens
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      tab.classList.add('drag-over');
    });
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over');
    });
    tab.addEventListener('drop', async (e) => {
      e.preventDefault();
      tab.classList.remove('drag-over');
      const dataTransfer = e.dataTransfer.getData('text/plain');
      if (!dataTransfer) return;
      try {
        const payload = JSON.parse(dataTransfer);
        // Verifica se Ã© arrastar item
        if (payload.id && payload.directory) {
          const { id, directory: fromDir } = payload;
          const toDir = name;
        if (fromDir && id && toDir && fromDir !== toDir) {
          // NÃ£o permite mover para a Lixeira pela aba de diretÃ³rios.
          if (toDir === 'Geral' || toDir === TRASH_NAME) return;
          await model.moveItem(fromDir, toDir, id);
          await renderItems();
          showToast(chrome.i18n.getMessage('move') || 'Mover', 'success');
        }
        } else if (payload.tabIndex !== undefined) {
          // Arrastando um diretÃ³rio: payload.tabIndex contÃ©m Ã­ndice de origem
          const fromIndex = parseInt(payload.tabIndex, 10);
          const toIndex = parseInt(tab.dataset.index, 10);
          if (!isNaN(fromIndex) && !isNaN(toIndex) && fromIndex !== toIndex) {
            // Ajusta Ã­ndices para pular 'Geral'
            // names inclui 'Geral' na posiÃ§Ã£o 0; DirectoryOrder opera sobre nomes sem Geral
            // fromIndex e toIndex se referem a posiÃ§Ãµes em names; convertendo para posiÃ§Ãµes em array de usuÃ¡rio
            const fromUser = names[fromIndex] === 'Geral' ? -1 : names.slice(1).indexOf(names[fromIndex]);
            const toUser = names[toIndex] === 'Geral' ? -1 : names.slice(1).indexOf(names[toIndex]);
            if (fromUser >= 0 && toUser >= 0) {
              await model.reorderDirectories(fromUser, toUser);
              await renderDirectories();
            }
          }
        }
      } catch (err) {
        console.error('Erro ao processar drop:', err);
      }
    });
    // Drag de diretÃ³rios (somente usuÃ¡rios)
    if (isUserDir) {
      tab.setAttribute('draggable', 'true');
      tab.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ tabIndex: idx }));
      });
    }
    container.appendChild(tab);
  });
  // Guia especial de mais acessados
  const specialTab = document.createElement('div');
  specialTab.className = 'directory-tab special';
  specialTab.textContent = MORE_ACCESSED_NAME;
  specialTab.dataset.name = MORE_ACCESSED_NAME;
  if (selectedDirectory === MORE_ACCESSED_NAME) specialTab.classList.add('active');
  specialTab.addEventListener('click', async () => {
    selectedDirectory = MORE_ACCESSED_NAME;
    await model.setSettings({ selectedDirectory: MORE_ACCESSED_NAME });
    await renderDirectories();
    await renderItems();
  });
  container.appendChild(specialTab);
  // Guia da Lixeira
  const trashTab = document.createElement('div');
  trashTab.className = 'directory-tab trash';
  trashTab.textContent = TRASH_NAME;
  trashTab.dataset.name = TRASH_NAME;
  if (selectedDirectory === TRASH_NAME) trashTab.classList.add('active');
  trashTab.addEventListener('click', async () => {
    selectedDirectory = TRASH_NAME;
    await model.setSettings({ selectedDirectory: TRASH_NAME });
    await renderDirectories();
    await renderItems();
  });
  container.appendChild(trashTab);
}

/**
 * Renderiza a lista de itens conforme diretÃ³rio selecionado ou lista de
 * mais acessados. Aplica busca, ordenaÃ§Ã£o e constrÃ³i cards com aÃ§Ãµes.
 */
async function renderItems() {
  const listEl = document.getElementById('items-list');
  listEl.innerHTML = '';
  let items = [];
  // Atualiza botÃ£o de adicionar com base no diretÃ³rio selecionado
  updateAddButtonState();
  const isTrash = selectedDirectory === TRASH_NAME;
  const isAggregator = selectedDirectory === 'Geral';
  if (selectedDirectory === MORE_ACCESSED_NAME) {
    items = await model.getTopVisited(12);
  } else if (isTrash) {
    const trashList = await model.getTrash();
    items = trashList.map((t) => {
      // item contÃ©m dados do site. Inclui id original em item.id e id da lixeira em _trashId
      return { ...t.item, directory: t.originalDirectory, _trashId: t.id, deletedAt: t.deletedAt };
    });
  } else if (isAggregator) {
    items = await model.getAllItems();
  } else {
    const data = await model.getData();
    items = (data.directories[selectedDirectory] || []).map((item) => ({ ...item, directory: selectedDirectory }));
  }
  // Busca
  const query = (searchQuery || '').toLowerCase();
  if (query) {
    items = items.filter((item) => {
      const title = isTrash ? item.title : item.title;
      const url = isTrash ? item.url : item.url;
      return (
        (title && title.toLowerCase().includes(query)) ||
        (url && url.toLowerCase().includes(query))
      );
    });
  }
  // Ordena fixados primeiro (somente para diretÃ³rios regulares e agregador)
  if (!isTrash && !isAggregator && selectedDirectory !== MORE_ACCESSED_NAME) {
    const pinnedItems = items.filter((i) => i.pinned);
    const others = items.filter((i) => !i.pinned);
    items = [...pinnedItems, ...others];
  }
  // PermissÃ£o de drag-and-drop para itens: apenas diretÃ³rios regulares, sem busca
  const allowDnD = !isTrash && !isAggregator && selectedDirectory !== MORE_ACCESSED_NAME && !searchQuery;
  if (items.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'item-card';
    emptyState.textContent = chrome.i18n.getMessage('noItems') || 'Nenhum site salvo';
    listEl.appendChild(emptyState);
    return;
  }
  items.forEach((item, index) => {
    const card = document.createElement('li');
    card.className = 'item-card';
    card.dataset.index = index;
    card.setAttribute('draggable', allowDnD ? 'true' : 'false');
    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    // Se em modo seleÃ§Ã£o, adiciona checkbox no inÃ­cio
    if (selectMode) {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'select-checkbox';
      const key = isTrash ? item._trashId : item.id;
      chk.checked = selectedItems.has(key);
      chk.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedItems.add(key);
        } else {
          selectedItems.delete(key);
        }
        updateMultiSelectControls();
      });
      header.appendChild(chk);
    }
    // Favicon: tenta usar o favicon informado. Se ausente, usa
    // chrome://favicon para recuperar do domÃ­nio. Para sites que nÃ£o
    // retornam favicon (por exemplo, WhatsApp Web), usamos uma URL
    // padrÃ£o do site ou o Ã­cone da extensÃ£o como fallback. Ao
    // falhar, o elemento recebe o Ã­cone padrÃ£o do pacote.
    const fav = document.createElement('img');
    fav.className = 'favicon';
    let favUrl = '';
    if (item.favicon && item.favicon.trim()) {
      favUrl = item.favicon.trim();
    }
    if (!favUrl) {
      try {
        const u = new URL(item.url);
        // Pega Ã­cone padrÃ£o do domÃ­nio
        favUrl = `chrome://favicon/size/32@2x/${u.origin}`;
      } catch (_) {
        favUrl = '';
      }
    }
    fav.src = favUrl;
    fav.alt = '';
    fav.onerror = () => {
      // Para WhatsApp Web, define explicitamente o favicon
      if (/web\.whatsapp\.com/.test(item.url)) {
        fav.src = 'https://web.whatsapp.com/favicon.ico';
      } else {
        // Usa Ã­cone padrÃ£o da extensÃ£o como fallback
        fav.src = chrome.runtime.getURL('icons/48.png');
      }
      fav.onerror = null;
    };
    header.appendChild(fav);
    // TÃ­tulo e destaque
    const titleWrap = document.createElement('div');
    titleWrap.className = 'card-title';
    const titleEl = document.createElement('span');
    titleEl.className = 'title';
    titleEl.textContent = item.title || item.url;
    titleEl.title = item.url;
    // Abrir em nova guia
    titleEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openItem(item);
    });
    titleWrap.appendChild(titleEl);
    // Destaque
    if (item.highlight) {
      const hl = document.createElement('span');
      hl.className = 'highlight';
      hl.textContent = item.highlight;
      titleWrap.appendChild(hl);
    }
    header.appendChild(titleWrap);
    // Exibe diretÃ³rio original em modo lixeira
    if (isTrash) {
      const orig = document.createElement('span');
      orig.className = 'origin-dir';
      orig.textContent = item.directory;
      titleWrap.appendChild(orig);
    }
    header.appendChild(titleWrap);
    // ConstruÃ§Ã£o das aÃ§Ãµes varia conforme contexto
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (isTrash) {
      // Restaurar
      const restoreBtn = document.createElement('button');
      restoreBtn.title = chrome.i18n.getMessage('restore') || 'Restaurar';
      restoreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M3.51 9a9 9 0 0 1 15 5l1 3"/></svg>';
      restoreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await model.restoreFromTrash(item._trashId);
        await renderItems();
        showToast(chrome.i18n.getMessage('restored') || 'Restaurado', 'success');
      });
      actions.appendChild(restoreBtn);
      // Excluir definitivamente
      const permDelBtn = document.createElement('button');
      permDelBtn.title = chrome.i18n.getMessage('deletePermanently') || 'Excluir definitivamente';
      permDelBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      permDelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await showConfirm(chrome.i18n.getMessage('deletePermanentlyPrompt') || 'Excluir permanentemente?', {
          okLabel: chrome.i18n.getMessage('delete') || 'Excluir',
          cancelLabel: chrome.i18n.getMessage('cancel') || 'Cancelar'
        });
        if (ok) {
          await model.permanentlyDeleteTrash([item._trashId]);
          await renderItems();
          showToast(chrome.i18n.getMessage('delete') || 'Excluir', 'success');
        }
      });
      actions.appendChild(permDelBtn);
    } else {
      // BotÃ£o abrir
      const openBtn = document.createElement('button');
      openBtn.title = chrome.i18n.getMessage('open') || 'Abrir';
      openBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><polyline points="7 7 17 7 17 17"/></svg>';
      openBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await openItem(item);
      });
      actions.appendChild(openBtn);
      // Fixar / Desfixar
      const pinBtn = document.createElement('button');
      pinBtn.title = item.pinned ? chrome.i18n.getMessage('unpin') || 'Desfixar' : chrome.i18n.getMessage('pin') || 'Fixar';
      pinBtn.innerHTML = item.pinned
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 11 23 9 17 14 19 22 12 17.77 5 22 7 14 1 9 9 11 12 2"></polygon></svg>';
      pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await model.togglePinned(item.directory, item.id);
        await renderItems();
      });
      actions.appendChild(pinBtn);
      // Mover
      const moveBtn = document.createElement('button');
      moveBtn.title = chrome.i18n.getMessage('move') || 'Mover';
      moveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="19 9 22 12 19 15"/></svg>';
      moveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const names = await model.getDirectoryNames();
        // Remove diretÃ³rio atual e pastas virtuais
        const dirs = names.filter((n) => n !== item.directory && n !== 'Geral' && n !== TRASH_NAME);
        if (dirs.length === 0) return;
        const dest = await showSelectMenu(chrome.i18n.getMessage('move') || 'Mover', dirs);
        if (dest) {
          await model.moveItem(item.directory, dest, item.id);
          await renderItems();
          showToast(`Site movido para o diretÃ³rio ${dest}`, 'success');
        }
      });
      actions.appendChild(moveBtn);
      // Remover (enviar para lixeira)
      const delBtn = document.createElement('button');
      delBtn.title = chrome.i18n.getMessage('remove') || 'Remover';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await showConfirm(chrome.i18n.getMessage('removePrompt') || 'Remover este site?', {
          okLabel: chrome.i18n.getMessage('remove') || 'Remover',
          cancelLabel: chrome.i18n.getMessage('cancel') || 'Cancelar'
        });
        if (ok) {
          await model.removeSite(item.directory, item.id, true);
          await renderItems();
          showToast(chrome.i18n.getMessage('remove') || 'Remover', 'success');
        }
      });
      actions.appendChild(delBtn);
      // Funcionalidades
      const funcBtn = document.createElement('button');
      funcBtn.title = chrome.i18n.getMessage('functions') || 'Funcionalidades';
      funcBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1 1 0 0 0-.9-1.6 4 4 0 0 0-5-5 .9.9 0 0 0-.3-.7 1 1 0 0 0-1.5 0 .9.9 0 0 0-.3.7 4 4 0 0 0-5 5A1 1 0 0 0 4.6 15a1 1 0 0 0 0 1.5 4 4 0 0 0 5 5 1 1 0 0 0 1.5 1.3 1 1 0 0 0 1.5 0A1 1 0 0 0 15 21a4 4 0 0 0 5-5 1 1 0 0 0-.6-1z"/></svg>';
      funcBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFunctionsMenu(funcBtn, item);
      });
      actions.appendChild(funcBtn);
      // SeguranÃ§a
      const secBtn = document.createElement('button');
      secBtn.title = chrome.i18n.getMessage('security') || 'SeguranÃ§a e recursos';
      secBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
      secBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSecurityMenu(secBtn, item);
      });
      actions.appendChild(secBtn);
    }
    header.appendChild(actions);
    card.appendChild(header);
    // Corpo: galeria de prints
    const body = document.createElement('div');
    body.className = 'card-body';
    const metadataIndicators = [];
    if (hasFilledNote(item)) {
      metadataIndicators.push({
        className: 'meta-indicator note',
        title: 'Anotação preenchida',
        label: 'Anotação'
      });
    }
    if (hasFilledReminders(item)) {
      metadataIndicators.push({
        className: 'meta-indicator reminder',
        title: 'Lembrete preenchido',
        label: 'Lembrete'
      });
    }
    if (hasFilledCredentials(item)) {
      metadataIndicators.push({
        className: 'meta-indicator credentials',
        title: 'Credenciais preenchidas',
        label: 'Credenciais'
      });
    }
    if (metadataIndicators.length > 0) {
      const indicatorsRow = document.createElement('div');
      indicatorsRow.className = 'card-meta-indicators';
      metadataIndicators.forEach((indicator) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = indicator.className;
        dot.title = indicator.title;
        dot.setAttribute('aria-label', indicator.label);
        dot.addEventListener('click', async (event) => {
          event.stopPropagation();
          if (indicator.label === 'Anotação') {
            await openNoteEditor(item);
            return;
          }
          if (indicator.label === 'Lembrete') {
            showRemindersList(item);
            return;
          }
          if (indicator.label === 'Credenciais') {
            await showCredentialsView(item);
          }
        });
        indicatorsRow.appendChild(dot);
      });
      body.appendChild(indicatorsRow);
    }
    card.appendChild(body);
    // Drag start / end
    if (allowDnD) {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        const payload = JSON.stringify({ id: item.id, directory: item.directory });
        e.dataTransfer.setData('text/plain', payload);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    }
    listEl.appendChild(card);
  });
  // ReordenaÃ§Ã£o por drag-and-drop
  if (allowDnD) {
    listEl.ondragover = (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(listEl, e.clientY);
      const draggingEl = listEl.querySelector('.dragging');
      if (!draggingEl) return;
      if (afterElement == null) {
        listEl.appendChild(draggingEl);
      } else {
        listEl.insertBefore(draggingEl, afterElement);
      }
    };
    listEl.ondrop = async (e) => {
      e.preventDefault();
      const draggingEl = listEl.querySelector('.dragging');
      if (!draggingEl) return;
      const payload = e.dataTransfer.getData('text/plain');
      if (!payload) return;
      const { id, directory: fromDir } = JSON.parse(payload);
      if (fromDir !== selectedDirectory) return;
      const newIndex = Array.from(listEl.children).indexOf(draggingEl);
      const oldIndex = items.findIndex((it) => it.id === id);
      if (newIndex >= 0 && oldIndex >= 0 && newIndex !== oldIndex) {
        await model.reorderItem(selectedDirectory, oldIndex, newIndex);
        await renderItems();
      }
    };
  } else {
    listEl.ondragover = null;
    listEl.ondrop = null;
  }

  // Atualiza controles de seleÃ§Ã£o mÃºltipla apÃ³s renderizar
  updateMultiSelectControls();
}

/**
 * Calcula o elemento apÃ³s o qual o item arrastado deve ser inserido.
 * @param {HTMLElement} container
 * @param {number} y
 */
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.item-card:not(.dragging)')];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

/**
 * Abre site em nova aba e incrementa contagem de visitas.
 * @param {Object} item
 */
async function openItem(item) {
  try {
    await chrome.tabs.create({ url: item.url });
  } catch (e) {
    console.warn('Falha ao abrir aba:', e);
  }
  await model.incrementVisitCount(item.directory, item.id);
  if (selectedDirectory === MORE_ACCESSED_NAME) {
    await renderItems();
  }
}

/**
 * Manipuladores de eventos globais (botÃµes e inputs)
 */
function setupEventHandlers() {
  const addBtn = document.getElementById('add-site');
  addBtn.addEventListener('click', onAddSite);
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderItems();
  });
  const createDirBtn = document.getElementById('create-directory');
  createDirBtn.addEventListener('click', async () => {
    const name = await showPrompt(chrome.i18n.getMessage('newDirectoryName') || 'Nome do diretÃ³rio');
    if (name) {
      try {
        await model.createDirectory(name);
        selectedDirectory = name;
        await model.setSettings({ selectedDirectory: name });
        await renderDirectories();
        await renderItems();
        showToast(chrome.i18n.getMessage('createDirectory') || 'Criar diretÃ³rio', 'success');
      } catch (err) {
        showToast(err.message || 'Erro', 'error');
      }
    }
  });
  // Controles de seleÃ§Ã£o mÃºltipla
  const actionsBar = document.querySelector('.actions-bar');
  // BotÃ£o para alternar modo seleÃ§Ã£o
  let selectToggle = document.getElementById('toggle-select');
  if (!selectToggle) {
    selectToggle = document.createElement('button');
    selectToggle.id = 'toggle-select';
    selectToggle.className = 'secondary-btn';
    selectToggle.style.display = 'inline-flex';
    selectToggle.style.alignItems = 'center';
    selectToggle.style.gap = '4px';
    selectToggle.textContent = chrome.i18n.getMessage('select') || 'Selecionar';
    selectToggle.addEventListener('click', () => {
      selectMode = !selectMode;
      selectedItems.clear();
      renderItems();
      updateMultiSelectControls();
    });
    actionsBar.appendChild(selectToggle);
  }
  // BotÃ£o para remover selecionados (envia para lixeira ou exclui definitivamente)
  let delSelected = document.getElementById('delete-selected');
  if (!delSelected) {
    delSelected = document.createElement('button');
    delSelected.id = 'delete-selected';
    delSelected.className = 'secondary-btn';
    delSelected.style.display = 'none';
    delSelected.textContent = chrome.i18n.getMessage('deleteSelected') || 'Remover selecionados';
    delSelected.addEventListener('click', async () => {
      const ids = Array.from(selectedItems);
      if (ids.length === 0) return;
      if (selectedDirectory === TRASH_NAME) {
        // Excluir definitivamente itens da lixeira
        await model.permanentlyDeleteTrash(ids);
        showToast(chrome.i18n.getMessage('delete') || 'Excluir', 'success');
      } else if (selectedDirectory === MORE_ACCESSED_NAME) {
        // NÃ£o suporta remoÃ§Ã£o em massa em "Mais acessados"
        showToast(chrome.i18n.getMessage('cannotRemoveHere') || 'SeleÃ§Ã£o nÃ£o suportada neste contexto.', 'warning');
      } else {
        await model.removeSites(selectedDirectory, ids, true);
        showToast(chrome.i18n.getMessage('remove') || 'Remover', 'success');
      }
      selectMode = false;
      selectedItems.clear();
      await renderItems();
      updateMultiSelectControls();
    });
    actionsBar.appendChild(delSelected);
  }
  // BotÃ£o para restaurar selecionados (apenas lixeira)
  let restoreSelected = document.getElementById('restore-selected');
  if (!restoreSelected) {
    restoreSelected = document.createElement('button');
    restoreSelected.id = 'restore-selected';
    restoreSelected.className = 'secondary-btn';
    restoreSelected.style.display = 'none';
    restoreSelected.textContent = chrome.i18n.getMessage('restoreSelected') || 'Restaurar selecionados';
    restoreSelected.addEventListener('click', async () => {
      const ids = Array.from(selectedItems);
      if (ids.length === 0) return;
      for (const tid of ids) {
        await model.restoreFromTrash(tid);
      }
      showToast(chrome.i18n.getMessage('restored') || 'Restaurado', 'success');
      selectMode = false;
      selectedItems.clear();
      await renderItems();
      updateMultiSelectControls();
    });
    actionsBar.appendChild(restoreSelected);
  }
  updateMultiSelectControls();
  // Fechar menus ao clicar fora
  document.addEventListener('click', () => {
    closeMenus();
  });
}

/**
 * Adiciona o site da aba atual ao diretÃ³rio selecionado. Verifica duplicidade.
 */
async function onAddSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
      showToast('Não é possível adicionar esta página.', 'error');
      return;
    }
    const site = {
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || ''
    };
    const result = await model.addSite(selectedDirectory, site, false);
    if (result.status === 'duplicate') {
      const proceed = await showConfirm(chrome.i18n.getMessage('duplicatePrompt') || 'Site jÃ¡ adicionado. Deseja continuar mesmo assim?', {
        okLabel: chrome.i18n.getMessage('addSite') || 'Adicionar',
        cancelLabel: chrome.i18n.getMessage('cancel') || 'Cancelar'
      });
      if (!proceed) return;
      const res2 = await model.addSite(selectedDirectory, site, true);
      if (res2.status === 'added' || res2.status === 'merged') {
        showToast(chrome.i18n.getMessage('addedSuccess') || 'Adicionado com sucesso.', 'success');
        await renderItems();
      }
    } else {
      showToast(chrome.i18n.getMessage('addedSuccess') || 'Adicionado com sucesso.', 'success');
      await renderItems();
    }
  });
}

/**
 * Mostra menu de funcionalidades para um item (anotaÃ§Ã£o, destaque, lembretes).
 * @param {HTMLElement} btn BotÃ£o clicado
 * @param {Object} item Item
 */
function openFunctionsMenu(btn, item) {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  // Editar anotaÃ§Ã£o
  const noteBtn = document.createElement('button');
  noteBtn.textContent = chrome.i18n.getMessage('editNote') || 'Editar anotaÃ§Ã£o';
  noteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    await openNoteEditor(item);
  });
  menu.appendChild(noteBtn);

  // Renomear tÃ­tulo do site
  const renameSiteBtn = document.createElement('button');
  renameSiteBtn.textContent = chrome.i18n.getMessage('renameSite') || 'Renomear site';
  renameSiteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const currentTitle = item.title || item.url;
    const newTitle = await showPrompt(chrome.i18n.getMessage('renameSitePrompt') || 'Novo tÃ­tulo do site', currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      await model.renameSite(item.directory, item.id, newTitle.trim());
      showToast(chrome.i18n.getMessage('siteRenamed') || 'TÃ­tulo atualizado.', 'success');
      await renderItems();
    }
  });
  menu.appendChild(renameSiteBtn);
  // Editar destaque
  const highlightBtn = document.createElement('button');
  highlightBtn.textContent = chrome.i18n.getMessage('editHighlight') || 'Editar destaque';
  highlightBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const newHighlight = await showTextModal(chrome.i18n.getMessage('editHighlight') || 'Editar destaque', item.highlight || '', 120);
    if (newHighlight !== null) {
      await model.setHighlight(item.directory, item.id, newHighlight);
      showToast(chrome.i18n.getMessage('highlightSaved') || 'Destaque salvo.', 'success');
      await renderItems();
    }
  });
  menu.appendChild(highlightBtn);
  // Adicionar lembrete
  const reminderBtn = document.createElement('button');
  reminderBtn.textContent = chrome.i18n.getMessage('addReminder') || 'Adicionar lembrete';
  reminderBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    await openReminderCreator(item);
  });
  menu.appendChild(reminderBtn);
  // Ver lembretes
  const viewRemBtn = document.createElement('button');
  viewRemBtn.textContent = chrome.i18n.getMessage('viewReminders') || 'Ver lembretes';
  viewRemBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    showRemindersList(item);
  });
  menu.appendChild(viewRemBtn);
  // Posicionamento
  positionMenu(btn, menu);
  currentMenu = menu;
  document.body.appendChild(menu);
}

/**
 * Mostra menu de seguranÃ§a e recursos para um item (credenciais, print).
 * @param {HTMLElement} btn
 * @param {Object} item
 */
function openSecurityMenu(btn, item) {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  const viewCredBtn = document.createElement('button');
  viewCredBtn.textContent = chrome.i18n.getMessage('viewCredentials') || 'Ver credenciais';
  viewCredBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    await showCredentialsView(item);
  });
  menu.appendChild(viewCredBtn);
  const addCredBtn = document.createElement('button');
  addCredBtn.textContent = chrome.i18n.getMessage('editCredentials') || 'Gerenciar credenciais';
  addCredBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    await openCredentialCreator(item);
  });
  menu.appendChild(addCredBtn);
  // OpÃ§Ãµes de captura de print e galeria removidas
  positionMenu(btn, menu);
  currentMenu = menu;
  document.body.appendChild(menu);
}

/**
 * Posiciona um menu abaixo do botÃ£o sem sair da janela.
 * @param {HTMLElement} anchor
 * @param {HTMLElement} menu
 */
function positionMenu(anchor, menu) {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = 180;
  // Usa valores da janela para posicionar menu dentro
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/**
 * Fecha menus suspensos se existirem.
 */
function closeMenus() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
}

/**
 * Mostra lista de lembretes em modal para um item. Permite remover.
 * @param {Object} item
 */
function showRemindersList(item) {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'flex';
  const modal = document.createElement('div');
  modal.className = 'modal note-modal';
  const heading = document.createElement('h3');
  heading.textContent = chrome.i18n.getMessage('viewReminders') || 'Lembretes';
  modal.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'reminders-list';
  if (Array.isArray(item.reminders) && item.reminders.length > 0) {
    item.reminders.forEach((rem, idx) => {
      const row = document.createElement('div');
      row.className = 'reminder-item';
      const text = document.createElement('span');
      text.textContent = `${rem.date} - ${rem.note || ''}`;
      row.appendChild(text);
      const del = document.createElement('button');
      del.title = chrome.i18n.getMessage('delete') || 'Excluir';
      del.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      del.addEventListener('click', async () => {
        const ok = await showConfirm(chrome.i18n.getMessage('deleteReminderConfirm') || 'Excluir lembrete?', {
          okLabel: chrome.i18n.getMessage('delete') || 'Excluir',
          cancelLabel: chrome.i18n.getMessage('cancel') || 'Cancelar'
        });
        if (ok) {
          await model.removeReminder(item.directory, item.id, idx);
          showToast(chrome.i18n.getMessage('delete') || 'Excluir', 'success');
          container.style.display = 'none';
          container.innerHTML = '';
          renderItems();
        }
      });
      row.appendChild(del);
      list.appendChild(row);
    });
  } else {
    const empty = document.createElement('p');
    empty.textContent = chrome.i18n.getMessage('noReminders') || 'Nenhum lembrete';
    list.appendChild(empty);
  }
  modal.appendChild(list);
  const buttons = document.createElement('div');
  buttons.className = 'modal-buttons';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn ok';
  closeBtn.textContent = chrome.i18n.getMessage('close') || 'Fechar';
  closeBtn.addEventListener('click', () => {
    container.style.display = 'none';
    container.innerHTML = '';
  });
  buttons.appendChild(closeBtn);
  modal.appendChild(buttons);
  container.appendChild(modal);
}

/**
 * Mostra menu de seleÃ§Ã£o simples para escolher diretÃ³rio destino.
 * @param {string} title
 * @param {string[]} options
 * @returns {Promise<string|null>}
 */
function showSelectMenu(title, options) {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    // Use apenas a classe move-modal para centralizar e dimensionar
    modal.className = 'modal move-modal';
    // CabeÃ§alho do modal
    const heading = document.createElement('h3');
    heading.textContent = title;
    modal.appendChild(heading);
    // Ãrea de lista com rolagem quando necessÃ¡rio
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    list.style.flex = '1';
    list.style.overflowY = 'auto';
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'modal-btn';
      b.style.background = 'var(--secondary-bg)';
      b.style.color = 'var(--text-color)';
      b.textContent = opt;
      b.addEventListener('click', () => cleanup(opt));
      list.appendChild(b);
    });
    modal.appendChild(list);
    // RodapÃ© com botÃ£o de cancelar
    const footer = document.createElement('div');
    footer.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = chrome.i18n.getMessage('cancel') || 'Cancelar';
    cancelBtn.addEventListener('click', () => cleanup(null));
    footer.appendChild(cancelBtn);
    modal.appendChild(footer);
    container.appendChild(modal);
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
  });
}

/**
 * Menu de contexto de diretÃ³rio para renomear e excluir.
 * @param {string} dirName
 * @param {number} x
 * @param {number} y
 */
function showDirectoryContextMenu(dirName, x, y) {
  // Impede para Geral e especial
  if (dirName === 'Geral' || dirName === MORE_ACCESSED_NAME || dirName === TRASH_NAME) return;
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  // Renomear
  const rename = document.createElement('button');
  rename.textContent = chrome.i18n.getMessage('renameDirectory') || 'Renomear';
  rename.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const newName = await showPrompt(chrome.i18n.getMessage('renameDirectoryPrompt') || 'Novo nome', dirName);
    if (newName && newName !== dirName) {
      try {
        await model.renameDirectory(dirName, newName);
        await renderDirectories();
        await renderItems();
        showToast(chrome.i18n.getMessage('rename') || 'Renomear', 'success');
      } catch (err) {
        showToast(err.message || 'Erro', 'error');
      }
    }
  });
  menu.appendChild(rename);
  // Excluir
  const del = document.createElement('button');
  del.textContent = chrome.i18n.getMessage('deleteDirectory') || 'Excluir diretÃ³rio';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const ok = await showConfirm(chrome.i18n.getMessage('deleteDirectoryConfirm') || 'Excluir diretÃ³rio?', {
      okLabel: chrome.i18n.getMessage('delete') || 'Excluir',
      cancelLabel: chrome.i18n.getMessage('cancel') || 'Cancelar'
    });
    if (ok) {
      try {
        await model.deleteDirectory(dirName);
        await renderDirectories();
        await renderItems();
        showToast(chrome.i18n.getMessage('deleteDirectory') || 'Excluir diretÃ³rio', 'success');
      } catch (err) {
        showToast(err.message || 'Erro', 'error');
      }
    }
  });
  menu.appendChild(del);
  // Posiciona
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  currentMenu = menu;
  document.body.appendChild(menu);
}

//
// Modal global para seleÃ§Ã£o do site para captura de print via atalho
//
// A funcionalidade de captura global foi removida. A funÃ§Ã£o showGlobalScreenshotModal nÃ£o Ã© utilizada.

// ========================================================================
// FunÃ§Ãµes adicionais para senha mestre, credenciais e capturas
// ========================================================================

/**
 * Solicita a senha mestre ao usuÃ¡rio. Retorna string ou null.
 * Utiliza um modal com campo de senha.
 * @param {string} title
 */
function showPasswordPrompt(title = 'Senha mestre') {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal credentials-modal';
    const heading = document.createElement('h3');
    heading.textContent = title;
    modal.appendChild(heading);
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = chrome.i18n.getMessage('enterMasterPassword') || 'Senha mestre';
    modal.appendChild(input);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = chrome.i18n.getMessage('cancel') || 'Cancelar';
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn ok';
    okBtn.textContent = chrome.i18n.getMessage('confirm') || 'Confirmar';
    buttons.appendChild(cancelBtn);
    buttons.appendChild(okBtn);
    modal.appendChild(buttons);
    container.appendChild(modal);
    input.focus();
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
    cancelBtn.addEventListener('click', () => cleanup(null));
    okBtn.addEventListener('click', () => cleanup(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    });
  });
}

/**
 * Mostra modal para visualizar credenciais de um item. Requer senha mestre.
 * ApÃ³s validaÃ§Ã£o, exibe usuÃ¡rio e senha com opÃ§Ãµes copiar, editar e ocultar.
 * @param {Object} item
 */
async function showCredentialsView(item, existingPassword = null) {
  const pwd = existingPassword || await showPasswordPrompt(chrome.i18n.getMessage('enterMasterPassword') || 'Digite a senha mestre');
  if (!pwd) return;
  try {
    const creds = await model.getCredentials(item.directory, item.id, pwd);
    if (!Array.isArray(creds) || creds.length === 0) {
      showToast(chrome.i18n.getMessage('noCredentials') || 'Sem credenciais.', 'warning');
      return;
    }
    showCredentialsViewModal(item, creds, pwd);
  } catch (err) {
    showToast(err.message || (chrome.i18n.getMessage('invalidMasterPassword') || 'Senha incorreta. Tente novamente.'), 'error');
  }
}

/**
 * Exibe modal com credenciais descriptografadas e opÃ§Ãµes de copiar/remover/adicionar/ocultar.
 * @param {Object} item
 * @param {Array<{id:string,label:string,user:string,pass:string,lastUpdated:number|null}>} creds
 * @param {string} masterPassword
 */
function showCredentialsViewModal(item, creds, masterPassword) {
  const container = document.getElementById('modal-container');
  container.innerHTML = '';
  container.style.display = 'flex';
  const modal = document.createElement('div');
  modal.className = 'modal credentials-modal';
  const heading = document.createElement('h3');
  heading.textContent = chrome.i18n.getMessage('credentials') || 'Credenciais';
  modal.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'reminders-list';
  creds.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'reminder-item';
    card.style.display = 'block';
    card.style.padding = '10px';
    card.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    title.textContent = entry.label || 'Registro sem título';
    card.appendChild(title);

    const userRow = document.createElement('div');
    userRow.style.display = 'grid';
    userRow.style.gridTemplateColumns = '72px minmax(0, 1fr) auto';
    userRow.style.gap = '8px';
    userRow.style.alignItems = 'center';
    userRow.style.marginBottom = '8px';
    const userLabel = document.createElement('span');
    userLabel.textContent = 'Usuário:';
    userLabel.style.fontWeight = '600';
    const userValue = document.createElement('span');
    userValue.className = 'blurred';
    userValue.textContent = entry.user;
    userValue.style.wordBreak = 'break-all';
    const copyUserBtn = document.createElement('button');
    copyUserBtn.className = 'modal-btn';
    copyUserBtn.textContent = 'Copiar';
    copyUserBtn.style.background = 'var(--secondary-bg)';
    copyUserBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(entry.user);
        showToast(chrome.i18n.getMessage('copied') || 'Copiado para a área de transferência', 'success');
      } catch (_) {
        showToast('Erro ao copiar', 'error');
      }
    });
    userRow.appendChild(userLabel);
    userRow.appendChild(userValue);
    userRow.appendChild(copyUserBtn);
    card.appendChild(userRow);

    const passRow = document.createElement('div');
    passRow.style.display = 'grid';
    passRow.style.gridTemplateColumns = '72px minmax(0, 1fr) auto';
    passRow.style.gap = '8px';
    passRow.style.alignItems = 'center';
    const passLabel = document.createElement('span');
    passLabel.textContent = 'Senha:';
    passLabel.style.fontWeight = '600';
    const passValue = document.createElement('span');
    passValue.className = 'blurred';
    passValue.textContent = entry.pass;
    passValue.style.wordBreak = 'break-all';
    const copyPassBtn = document.createElement('button');
    copyPassBtn.className = 'modal-btn';
    copyPassBtn.textContent = 'Copiar';
    copyPassBtn.style.background = 'var(--secondary-bg)';
    copyPassBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(entry.pass);
        showToast(chrome.i18n.getMessage('copied') || 'Copiado para a área de transferência', 'success');
      } catch (_) {
        showToast('Erro ao copiar', 'error');
      }
    });
    passRow.appendChild(passLabel);
    passRow.appendChild(passValue);
    passRow.appendChild(copyPassBtn);
    card.appendChild(passRow);

    const entryActions = document.createElement('div');
    entryActions.className = 'modal-buttons';
    entryActions.style.marginTop = '10px';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'modal-btn cancel';
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', async () => {
      const ok = confirm('Remover esta credencial?');
      if (!ok) return;
      await model.removeCredential(item.directory, item.id, entry.id);
      showToast('Credencial removida.', 'success');
      await renderItems();
      const updatedCreds = await model.getCredentials(item.directory, item.id, masterPassword);
      if (!updatedCreds.length) {
        cleanup();
        return;
      }
      showCredentialsViewModal(item, updatedCreds, masterPassword);
    });
    entryActions.appendChild(removeBtn);
    card.appendChild(entryActions);

    userValue.addEventListener('click', () => reveal(userValue));
    passValue.addEventListener('click', () => reveal(passValue));
    list.appendChild(card);
  });
  modal.appendChild(list);
  // BotÃµes
  const buttons = document.createElement('div');
  buttons.className = 'modal-buttons';
  const addBtn = document.createElement('button');
  addBtn.className = 'modal-btn ok';
  addBtn.textContent = 'Adicionar credencial';
  addBtn.addEventListener('click', async () => {
    container.style.display = 'none';
    container.innerHTML = '';
    await openCredentialCreator(item, masterPassword);
  });
  const hideBtn = document.createElement('button');
  hideBtn.className = 'modal-btn cancel';
  hideBtn.textContent = chrome.i18n.getMessage('hide') || 'Ocultar';
  hideBtn.addEventListener('click', () => {
    cleanup();
  });
  buttons.appendChild(addBtn);
  buttons.appendChild(hideBtn);
  modal.appendChild(buttons);
  container.appendChild(modal);
  function reveal(spanEl) {
    spanEl.classList.add('visible');
    setTimeout(() => {
      spanEl.classList.remove('visible');
    }, 5000);
  }
  // Clear after 60s
  const timer = setTimeout(() => {
    creds.forEach((entry) => {
      entry.user = '';
      entry.pass = '';
    });
  }, 60000);
  function cleanup() {
    clearTimeout(timer);
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

/**
 * Abre modal com galeria de capturas para um item, permitindo copiar e excluir.
 * @param {Object} item
 */
// A funcionalidade de visualizaÃ§Ã£o de capturas em galeria foi removida.



