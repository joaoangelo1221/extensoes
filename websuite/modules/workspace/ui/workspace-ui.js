// lib/ui.js
// UtilitÃƒÂ¡rios de interface para o popup: toasts, confirmaÃƒÂ§ÃƒÂµes, prompts e modais
// especializados (notas, destaques, lembretes e credenciais).

import { getLanguage, translate } from '../../../core/i18n.js';

const language = await getLanguage();
const getMessage = (key, fallback = '') => translate(language, key) || fallback || key;

export function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type) toast.classList.add(`toast-${type}`);
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);
  container.appendChild(toast);
  void toast.offsetWidth;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

export function showConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    if (!container) return resolve(false);
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const msgEl = document.createElement('p');
    msgEl.textContent = message;
    modal.appendChild(msgEl);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = opts.cancelLabel || getMessage('cancel') || 'Cancelar';
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn ok';
    okBtn.textContent = opts.okLabel || getMessage('confirm') || 'Confirmar';
    buttons.appendChild(cancelBtn);
    buttons.appendChild(okBtn);
    modal.appendChild(buttons);
    container.appendChild(modal);
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
    cancelBtn.addEventListener('click', () => cleanup(false));
    okBtn.addEventListener('click', () => cleanup(true));
  });
}

export function showPrompt(label, initial = '') {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    if (!container) return resolve(null);
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    modal.appendChild(lbl);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initial;
    modal.appendChild(input);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = getMessage('cancel') || 'Cancelar';
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn ok';
    okBtn.textContent = getMessage('confirm') || 'Confirmar';
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
    okBtn.addEventListener('click', () => cleanup(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(input.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    });
  });
}

export function showTextModal(title, initial = '', maxLen = 120) {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    if (!container) return resolve(null);
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal note-modal';
    const heading = document.createElement('h3');
    heading.textContent = title;
    modal.appendChild(heading);
    const textarea = document.createElement('textarea');
    textarea.value = initial;
    textarea.maxLength = maxLen;
    textarea.autofocus = true;
    modal.appendChild(textarea);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = getMessage('cancel') || 'Cancelar';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn ok';
    saveBtn.textContent = getMessage('save') || 'Salvar';
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    modal.appendChild(buttons);
    container.appendChild(modal);
    textarea.focus();
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
    cancelBtn.addEventListener('click', () => cleanup(null));
    saveBtn.addEventListener('click', () => cleanup(textarea.value.trim()));
  });
}

export function showReminderModal(title = 'Adicionar lembrete', initialDate = '', initialNote = '') {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    if (!container) return resolve(null);
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal note-modal';
    const heading = document.createElement('h3');
    heading.textContent = title;
    modal.appendChild(heading);
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Data:';
    modal.appendChild(dateLabel);
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = initialDate;
    modal.appendChild(dateInput);
    const noteLabel = document.createElement('label');
    noteLabel.textContent = 'Nota:';
    modal.appendChild(noteLabel);
    const noteInput = document.createElement('textarea');
    noteInput.value = initialNote;
    noteInput.rows = 3;
    modal.appendChild(noteInput);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = getMessage('cancel') || 'Cancelar';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn ok';
    saveBtn.textContent = getMessage('save') || 'Salvar';
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    modal.appendChild(buttons);
    container.appendChild(modal);
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
    cancelBtn.addEventListener('click', () => cleanup(null));
    saveBtn.addEventListener('click', () => {
      const date = dateInput.value;
      const note = noteInput.value.trim();
      if (!date) {
        showToast(getMessage('enterDate', 'Informe uma data'), 'warning');
        return;
      }
      cleanup({ date, note });
    });
  });
}

export function showCredentialsModal(hasMaster, initial = {}) {
  return new Promise((resolve) => {
    const container = document.getElementById('modal-container');
    container.innerHTML = '';
    container.style.display = 'flex';
    const modal = document.createElement('div');
    modal.className = 'modal note-modal';
    const heading = document.createElement('h3');
    heading.textContent = getMessage('credentials', 'Credenciais');
    modal.appendChild(heading);
    const labelLabel = document.createElement('label');
    labelLabel.textContent = getMessage('credentialsRecordTitle', 'TÃ­tulo do registro:');
    modal.appendChild(labelLabel);
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = getMessage('credentialsRecordTitlePlaceholder', 'Ex.: Principal, Financeiro, Suporte');
    labelInput.value = initial.label || '';
    modal.appendChild(labelInput);
    const userLabel = document.createElement('label');
    userLabel.textContent = getMessage('credentialsUserLabel', 'UsuÃ¡rio:');
    modal.appendChild(userLabel);
    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.value = initial.user || '';
    modal.appendChild(userInput);
    const passLabel = document.createElement('label');
    passLabel.textContent = getMessage('credentialsPasswordLabel', 'Senha:');
    modal.appendChild(passLabel);
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.value = initial.pass || '';
    modal.appendChild(passInput);
    const mpLabel = document.createElement('label');
    mpLabel.textContent = hasMaster ? getMessage('credentialsMasterPassword', 'Senha mestre:') : getMessage('credentialsSetMasterPassword', 'Defina uma nova senha mestre:');
    modal.appendChild(mpLabel);
    const mpInput = document.createElement('input');
    mpInput.type = 'password';
    modal.appendChild(mpInput);
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = getMessage('cancel') || 'Cancelar';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn ok';
    saveBtn.textContent = getMessage('save') || 'Salvar';
    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    modal.appendChild(buttons);
    container.appendChild(modal);
    userInput.focus();
    function cleanup(result) {
      container.style.display = 'none';
      container.innerHTML = '';
      resolve(result);
    }
    cancelBtn.addEventListener('click', () => cleanup(null));
    saveBtn.addEventListener('click', () => {
      cleanup({
        label: labelInput.value.trim(),
        user: userInput.value.trim(),
        pass: passInput.value,
        masterPassword: mpInput.value
      });
    });
  });
}
