(function () {
  const STORAGE_KEY = 'websuite.language';
  const FALLBACK_LANGUAGE = 'pt-BR';
  const dictionaries = {
    'pt-BR': {
      appTitle: 'WebSuite',
      workspace: 'Workspace',
      automation: 'Automation',
      privacy: 'Privacy',
      language: 'Idioma',
      search: 'Buscar...',
      workspaceTitle: 'Workspace',
      createDirectory: 'Criar diretório',
      addCurrentSite: 'Adicionar site da aba',
      general: 'Geral',
      automationTitle: 'Loki',
      autoRefresh: 'Atualização automática',
      currentTab: 'Aba atual',
      sameDomain: 'Mesmo domínio',
      selectedTabs: 'Múltiplas abas selecionadas',
      allTabs: 'Todas as abas',
      start: 'Iniciar',
      stopAll: 'Parar todos',
      advancedOptions: 'Opções avançadas',
      localStorageLabel: 'Armazenamento local',
      sessionStorageLabel: 'Armazenamento de sessão',
      clearCurrentSite: 'Limpar site atual',
      clearOpenDomain: 'Limpar domínio aberto',
      clearAllText: 'Limpar tudo',
      timerStatus: 'Status dos temporizadores',
      privacyTitle: 'Controle Rápido',
      keyboardShortcuts: 'Atalhos de Teclado',
      privacyShortcutHelp: 'Se não funcionar no seu layout, abra chrome://extensions/shortcuts e ajuste os atalhos.',
      privacySwitchTabs: 'Trocar abas',
      passwordLock: 'Bloqueio por Senha',
      currentPassword: 'Senha atual (se houver)',
      newPassword: 'Nova senha',
      save: 'Salvar',
      lockCurrent: 'Bloquear esta aba',
      unlockCurrent: 'Desbloquear esta aba',
      lockAll: 'Bloquear todas',
      unlockAll: 'Desbloquear todas',
      floatingLock: 'Cadeado flutuante',
      opacity: 'Opacidade do balão',
      privacyFloatingHelp: 'Permite mostrar, mover ou remover o cadeado de bloqueio no canto da página.',
      privacyUnlockCurrentPlaceholder: 'Senha para desbloquear esta aba',
      privacyUnlockAllPlaceholder: 'Senha para desbloquear todas',
      highlightTitle: 'Realçar texto',
      highlightSelection: 'Realçar seleção',
      clearHighlights: 'Limpeza geral',
      clearOneHighlight: 'Limpeza individual',
      privacyHighlightHelp: 'Selecione um texto e use a limpeza individual para remover apenas os realces clicados.',
      notesTitle: 'Notas fixas',
      addNote: 'Adicionar nota',
      clearNotes: 'Limpar notas',
      privacyNotesHelp: 'A nota fica sobre a página e continua visível durante a navegação.'
    },
    en: {
      appTitle: 'WebSuite',
      workspace: 'Workspace',
      automation: 'Automation',
      privacy: 'Privacy',
      language: 'Language',
      search: 'Search...',
      workspaceTitle: 'Workspace',
      createDirectory: 'Create folder',
      addCurrentSite: 'Add current tab site',
      general: 'General',
      automationTitle: 'Loki',
      autoRefresh: 'Auto refresh',
      currentTab: 'Current tab',
      sameDomain: 'Same domain',
      selectedTabs: 'Multiple selected tabs',
      allTabs: 'All tabs',
      start: 'Start',
      stopAll: 'Stop all',
      advancedOptions: 'Advanced options',
      localStorageLabel: 'Local storage',
      sessionStorageLabel: 'Session storage',
      clearCurrentSite: 'Clear current site',
      clearOpenDomain: 'Clear open domain',
      clearAllText: 'Clear all',
      timerStatus: 'Timer status',
      privacyTitle: 'Quick Control',
      keyboardShortcuts: 'Keyboard shortcuts',
      privacyShortcutHelp: 'If it does not work on your keyboard layout, open chrome://extensions/shortcuts and adjust the shortcuts.',
      privacySwitchTabs: 'Switch tabs',
      passwordLock: 'Password lock',
      currentPassword: 'Current password (if any)',
      newPassword: 'New password',
      save: 'Save',
      lockCurrent: 'Lock this tab',
      unlockCurrent: 'Unlock this tab',
      lockAll: 'Lock all',
      unlockAll: 'Unlock all',
      floatingLock: 'Floating lock',
      opacity: 'Bubble opacity',
      privacyFloatingHelp: 'Lets you show, move or hide the floating lock on the page.',
      privacyUnlockCurrentPlaceholder: 'Password to unlock this tab',
      privacyUnlockAllPlaceholder: 'Password to unlock all tabs',
      highlightTitle: 'Highlight text',
      highlightSelection: 'Highlight selection',
      clearHighlights: 'Clear all',
      clearOneHighlight: 'Clear one',
      privacyHighlightHelp: 'Select text and use single clear to remove only clicked highlights.',
      notesTitle: 'Sticky notes',
      addNote: 'Add note',
      clearNotes: 'Clear notes',
      privacyNotesHelp: 'The note stays on the page and remains visible while you navigate.'
    },
    es: {
      appTitle: 'WebSuite',
      workspace: 'Workspace',
      automation: 'Automation',
      privacy: 'Privacy',
      language: 'Idioma',
      search: 'Buscar...',
      workspaceTitle: 'Workspace',
      createDirectory: 'Crear carpeta',
      addCurrentSite: 'Agregar sitio de la pestaña',
      general: 'General',
      automationTitle: 'Loki',
      autoRefresh: 'Actualización automática',
      currentTab: 'Pestaña actual',
      sameDomain: 'Mismo dominio',
      selectedTabs: 'Múltiples pestañas seleccionadas',
      allTabs: 'Todas las pestañas',
      start: 'Iniciar',
      stopAll: 'Detener todo',
      advancedOptions: 'Opciones avanzadas',
      localStorageLabel: 'Almacenamiento local',
      sessionStorageLabel: 'Almacenamiento de sesión',
      clearCurrentSite: 'Limpiar sitio actual',
      clearOpenDomain: 'Limpiar dominio abierto',
      clearAllText: 'Limpiar todo',
      timerStatus: 'Estado de temporizadores',
      privacyTitle: 'Control rápido',
      keyboardShortcuts: 'Atajos de teclado',
      privacyShortcutHelp: 'Si no funciona en su distribución de teclado, abra chrome://extensions/shortcuts y ajuste los atajos.',
      privacySwitchTabs: 'Cambiar pestañas',
      passwordLock: 'Bloqueo por contraseña',
      currentPassword: 'Contraseña actual (si existe)',
      newPassword: 'Nueva contraseña',
      save: 'Guardar',
      lockCurrent: 'Bloquear esta pestaña',
      unlockCurrent: 'Desbloquear esta pestaña',
      lockAll: 'Bloquear todas',
      unlockAll: 'Desbloquear todas',
      floatingLock: 'Candado flotante',
      opacity: 'Opacidad del globo',
      privacyFloatingHelp: 'Permite mostrar, mover u ocultar el candado flotante en la página.',
      privacyUnlockCurrentPlaceholder: 'Contraseña para desbloquear esta pestaña',
      privacyUnlockAllPlaceholder: 'Contraseña para desbloquear todas',
      highlightTitle: 'Resaltar texto',
      highlightSelection: 'Resaltar selección',
      clearHighlights: 'Limpieza general',
      clearOneHighlight: 'Limpieza individual',
      privacyHighlightHelp: 'Seleccione texto y use la limpieza individual para eliminar solo los resaltados pulsados.',
      notesTitle: 'Notas fijas',
      addNote: 'Agregar nota',
      clearNotes: 'Limpiar notas',
      privacyNotesHelp: 'La nota permanece en la página y sigue visible durante la navegación.'
    }
  };

  async function getLanguage() {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    return stored?.[STORAGE_KEY] || FALLBACK_LANGUAGE;
  }

  function translate(language, key) {
    return dictionaries[language]?.[key] || dictionaries[FALLBACK_LANGUAGE]?.[key] || '';
  }

  window.websuiteApplyTranslations = async function (root = document) {
    const language = await getLanguage();
    root.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      const value = translate(language, key);
      if (value) element.textContent = value;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.dataset.i18nPlaceholder;
      const value = translate(language, key);
      if (value) element.setAttribute('placeholder', value);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((element) => {
      const key = element.dataset.i18nTitle;
      const value = translate(language, key);
      if (value) element.setAttribute('title', value);
    });
  };
})();
