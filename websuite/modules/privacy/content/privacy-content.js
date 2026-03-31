(function () {
  const IS_TOP = window.top === window;
  const NOTE_STORAGE_KEY = `qh-notes:${location.origin}${location.pathname}${location.search}`;
  const HIGHLIGHT_CLASS = "qh-highlight";

  let overlay;
  let errorEl;
  let fab;
  let fabAction;
  let fabClose;
  let highlightRemovalMode = false;
  let toastTimer = null;
  let notesLayer;
  let tabState = {
    tabId: null,
    blurAmount: 6,
    floatingLockEnabled: true,
    floatingLockPosition: null,
    floatingLockOpacity: 0.9,
    lockActive: false,
  };

  const hasRuntime = () =>
    typeof chrome !== "undefined" &&
    chrome?.runtime &&
    typeof chrome.runtime.sendMessage === "function" &&
    !!chrome.runtime.id;

  function safeRuntimeSend(message) {
    return new Promise((resolve) => {
      if (!hasRuntime()) return resolve(null);
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const err = chrome.runtime.lastError;
          if (err && /context invalidated/i.test(err.message || "")) return resolve(null);
          resolve(response ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) return resolve(null);
      chrome.storage.local.get([key], (data) => resolve(data?.[key] ?? null));
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) return resolve(false);
      chrome.storage.local.set(data, () => resolve(!chrome.runtime?.lastError));
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function showToast(message) {
    if (!IS_TOP) return;
    let toast = document.getElementById("qh-inline-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "qh-inline-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("qh-toast-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("qh-toast-visible"), 2200);
  }

  function unwrapHighlight(mark) {
    if (!mark?.parentNode) return;
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }

  function clearHighlights() {
    document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`).forEach(unwrapHighlight);
  }

  function enableHighlightRemovalMode() {
    highlightRemovalMode = true;
    document.documentElement.classList.add("qh-highlight-remove-mode");
    showToast("Clique em um realce para remover apenas ele.");
  }

  function disableHighlightRemovalMode() {
    highlightRemovalMode = false;
    document.documentElement.classList.remove("qh-highlight-remove-mode");
  }

  function normalizeRangeBoundaries(range) {
    if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
      const node = range.startContainer.childNodes[range.startOffset] || range.startContainer.childNodes[range.startOffset - 1];
      if (node && node.nodeType === Node.TEXT_NODE) range.setStart(node, 0);
    }
    if (range.endContainer.nodeType === Node.ELEMENT_NODE) {
      const node = range.endContainer.childNodes[range.endOffset - 1];
      if (node && node.nodeType === Node.TEXT_NODE) range.setEnd(node, node.textContent.length);
    }
  }

  function wrapTextNodeSegment(node, start, end, color) {
    if (!node || end <= start) return;
    const middle = node.splitText(start);
    middle.splitText(end - start);
    const mark = document.createElement("mark");
    mark.className = HIGHLIGHT_CLASS;
    mark.dataset.highlightId = createId("highlight");
    mark.style.backgroundColor = color;
    middle.parentNode.insertBefore(mark, middle);
    mark.appendChild(middle);
  }

  function wrapRangeFallback(range, color) {
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);
        const includeNode =
          range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0 &&
          range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0;
        return includeNode ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent.length;
      wrapTextNodeSegment(node, start, end, color);
    });
  }

  function highlightSelection(color) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

    const ranges = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index).cloneRange();
      normalizeRangeBoundaries(range);
      if (!range.collapsed) ranges.push(range);
    }

    let created = false;
    ranges.forEach((range) => {
      try {
        const mark = document.createElement("mark");
        mark.className = HIGHLIGHT_CLASS;
        mark.dataset.highlightId = createId("highlight");
        mark.style.backgroundColor = color;
        range.surroundContents(mark);
        created = true;
      } catch {
        wrapRangeFallback(range, color);
        created = true;
      }
    });

    selection.removeAllRanges();
    return created;
  }

  function setBlur(amount = 6) {
    document.documentElement.style.setProperty("--qh-blur", `${amount}px`);
    document.documentElement.classList.add("qh-locked-blur");
  }

  function clearBlur() {
    document.documentElement.classList.remove("qh-locked-blur");
    document.documentElement.style.removeProperty("--qh-blur");
  }

  async function ensureOverlay() {
    if (!IS_TOP) return null;
    overlay = document.getElementById("qh-lock-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "qh-lock-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div id="qh-lock-card" tabindex="-1" aria-labelledby="qh-lock-title" aria-describedby="qh-lock-desc">
        <div class="qh-lock-badge">Acesso protegido</div>
        <h2 id="qh-lock-title">Esta aba está bloqueada</h2>
        <p id="qh-lock-desc">Digite a senha para voltar a usar este conteúdo.</p>
        <input id="qh-lock-input" type="password" placeholder="Senha" autocomplete="current-password" autofocus />
        <button id="qh-lock-btn" type="button">Desbloquear</button>
        <div id="qh-lock-error" aria-live="polite"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    errorEl = overlay.querySelector("#qh-lock-error");
    overlay.querySelector("#qh-lock-btn").addEventListener("click", submitUnlock);
    overlay.querySelector("#qh-lock-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitUnlock();
    });
    return overlay;
  }

  async function submitUnlock() {
    const input = overlay?.querySelector("#qh-lock-input");
    const password = input?.value || "";
    const res = await safeRuntimeSend({ type: "PRIVACY/TRY_UNLOCK_FROM_CONTENT", payload: { tabId: tabState.tabId, password } });
    if (res?.ok) {
      clearLockVisuals();
      return;
    }
    if (errorEl) errorEl.textContent = res?.error || "Falha ao desbloquear.";
  }

  function getDefaultFabPosition() {
    return { x: Math.max(16, window.innerWidth - 68), y: Math.max(16, window.innerHeight - 68) };
  }

  function getFabPosition() {
    return tabState.floatingLockPosition || getDefaultFabPosition();
  }

  function applyFabPosition(position) {
    if (!fab) return;
    const x = clamp(position.x, 8, Math.max(8, window.innerWidth - fab.offsetWidth - 8));
    const y = clamp(position.y, 8, Math.max(8, window.innerHeight - fab.offsetHeight - 8));
    fab.style.left = `${x}px`;
    fab.style.top = `${y}px`;
  }

  function shouldShowFab() {
    return IS_TOP && tabState.floatingLockEnabled && !tabState.lockActive;
  }

  function renderFabVisibility() {
    if (!fab) return;
    fab.style.display = shouldShowFab() ? "flex" : "none";
    fab.style.opacity = String(tabState.floatingLockOpacity ?? 0.9);
  }

  function enableFabDrag() {
    if (!fab) return;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let dragging = false;
    let moved = false;

    const onMove = (event) => {
      if (!dragging) return;
      const clientX = event.clientX ?? event.touches?.[0]?.clientX;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;
      moved = moved || Math.abs(clientX - startX) > 4 || Math.abs(clientY - startY) > 4;
      applyFabPosition({ x: baseX + clientX - startX, y: baseY + clientY - startY });
    };

    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("touchend", onUp, true);
      tabState.floatingLockPosition = {
        x: parseInt(fab.style.left || "0", 10),
        y: parseInt(fab.style.top || "0", 10),
      };
      await safeRuntimeSend({ type: "PRIVACY/SET_FLOATING_LOCK_POSITION", payload: { position: tabState.floatingLockPosition } });
      fab.dataset.dragged = moved ? "true" : "false";
      window.setTimeout(() => delete fab.dataset.dragged, 120);
    };

    const onDown = (event) => {
      if (event.target === fabClose) return;
      const clientX = event.clientX ?? event.touches?.[0]?.clientX;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;
      dragging = true;
      moved = false;
      startX = clientX;
      startY = clientY;
      baseX = parseInt(fab.style.left || "0", 10);
      baseY = parseInt(fab.style.top || "0", 10);
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
      document.addEventListener("touchmove", onMove, true);
      document.addEventListener("touchend", onUp, true);
    };

    fab.addEventListener("mousedown", onDown);
    fab.addEventListener("touchstart", onDown, { passive: true });
  }

  function ensureFloatingLockButton() {
    if (!IS_TOP) return;
    fab = document.getElementById("qh-fab-lock");
    if (fab) {
      applyFabPosition(getFabPosition());
      renderFabVisibility();
      return;
    }

    fab = document.createElement("div");
    fab.id = "qh-fab-lock";
    fab.innerHTML = `
      <button id="qh-fab-action" type="button" aria-label="Bloquear esta aba" title="Bloquear esta aba">
        <span class="qh-fab-icon">&#128274;</span>
      </button>
      <span class="qh-fab-label">Bloquear aba</span>
      <button id="qh-fab-close" type="button" aria-label="Ocultar balão">&times;</button>
    `;
    document.documentElement.appendChild(fab);

    fabAction = fab.querySelector("#qh-fab-action");
    fabClose = fab.querySelector("#qh-fab-close");
    fabClose.addEventListener("click", async (event) => {
      event.stopPropagation();
      tabState.floatingLockEnabled = false;
      renderFabVisibility();
      await safeRuntimeSend({ type: "PRIVACY/SET_FLOATING_LOCK_ENABLED", payload: { enabled: false } });
    });

    fabAction.addEventListener("click", async (event) => {
      event.stopPropagation();
      await safeRuntimeSend({ type: "PRIVACY/LOCK_CURRENT", payload: { tabId: tabState.tabId } });
    });

    enableFabDrag();
    applyFabPosition(getFabPosition());
    renderFabVisibility();
  }

  function ensureNotesLayer() {
    if (!IS_TOP) return null;
    notesLayer = document.getElementById("qh-notes-layer");
    if (notesLayer) return notesLayer;
    notesLayer = document.createElement("div");
    notesLayer.id = "qh-notes-layer";
    document.documentElement.appendChild(notesLayer);
    return notesLayer;
  }

  function getDefaultNote(index = 0) {
    return {
      id: createId("note"),
      text: "",
      color: "#ffe400",
      textColor: "#664d00",
      x: clamp(32 + index * 26, 16, Math.max(16, window.innerWidth - 250)),
      y: clamp(88 + index * 26, 16, Math.max(16, window.innerHeight - 250)),
    };
  }

  async function getStoredNotes() {
    return (await storageGet(NOTE_STORAGE_KEY)) || [];
  }

  async function saveNotes(notes) {
    await storageSet({ [NOTE_STORAGE_KEY]: notes });
  }

  function collectNotesFromDom() {
    return Array.from(document.querySelectorAll(".qh-note")).map((noteEl) => ({
      id: noteEl.dataset.noteId,
      text: noteEl.querySelector("textarea")?.value || "",
      color: noteEl.dataset.noteColor || "#ffe400",
      textColor: noteEl.dataset.noteTextColor || "#664d00",
      x: parseInt(noteEl.style.left || "0", 10),
      y: parseInt(noteEl.style.top || "0", 10),
    }));
  }

  async function persistRenderedNotes() {
    await saveNotes(collectNotesFromDom());
  }

  function attachNoteInteractions(noteEl) {
    const handle = noteEl.querySelector(".qh-note-pin");
    const textarea = noteEl.querySelector("textarea");
    const removeBtn = noteEl.querySelector(".qh-note-remove");
    const colorInput = noteEl.querySelector(".qh-note-color");
    const textColorInput = noteEl.querySelector(".qh-note-text-color");
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let dragging = false;

    const onMove = (event) => {
      if (!dragging) return;
      const clientX = event.clientX ?? event.touches?.[0]?.clientX;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;
      const nextX = clamp(baseX + clientX - startX, 8, Math.max(8, window.innerWidth - noteEl.offsetWidth - 8));
      const nextY = clamp(baseY + clientY - startY, 8, Math.max(8, window.innerHeight - noteEl.offsetHeight - 8));
      noteEl.style.left = `${nextX}px`;
      noteEl.style.top = `${nextY}px`;
    };

    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("touchend", onUp, true);
      await persistRenderedNotes();
    };

    const onDown = (event) => {
      const clientX = event.clientX ?? event.touches?.[0]?.clientX;
      const clientY = event.clientY ?? event.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;
      dragging = true;
      startX = clientX;
      startY = clientY;
      baseX = parseInt(noteEl.style.left || "0", 10);
      baseY = parseInt(noteEl.style.top || "0", 10);
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
      document.addEventListener("touchmove", onMove, true);
      document.addEventListener("touchend", onUp, true);
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: true });
    textarea.addEventListener("input", () => { persistRenderedNotes(); });
    colorInput.addEventListener("input", async () => {
      noteEl.dataset.noteColor = colorInput.value;
      noteEl.style.setProperty("--qh-note-color", colorInput.value);
      await persistRenderedNotes();
    });
    textColorInput.addEventListener("input", async () => {
      noteEl.dataset.noteTextColor = textColorInput.value;
      noteEl.style.setProperty("--qh-note-text-color", textColorInput.value);
      await persistRenderedNotes();
    });
    removeBtn.addEventListener("click", async () => {
      noteEl.remove();
      await persistRenderedNotes();
    });
  }

  function renderNote(note) {
    const layer = ensureNotesLayer();
    if (!layer) return null;
    const noteEl = document.createElement("div");
    noteEl.className = "qh-note";
    noteEl.dataset.noteId = note.id;
    noteEl.dataset.noteColor = note.color || "#ffe400";
    noteEl.dataset.noteTextColor = note.textColor || "#664d00";
    noteEl.style.left = `${note.x}px`;
    noteEl.style.top = `${note.y}px`;
    noteEl.style.setProperty("--qh-note-color", note.color || "#ffe400");
    noteEl.style.setProperty("--qh-note-text-color", note.textColor || "#664d00");
    noteEl.innerHTML = `
      <button class="qh-note-pin" type="button" aria-label="Mover nota">&#128204;</button>
      <label class="qh-note-color-swatch" aria-label="Cor da nota" title="Cor de fundo da nota">
        <input class="qh-note-color" type="color" value="${note.color || "#ffe400"}" />
      </label>
      <label class="qh-note-text-color-swatch" aria-label="Cor do texto da nota" title="Cor do texto da nota">
        <input class="qh-note-text-color" type="color" value="${note.textColor || "#664d00"}" />
      </label>
      <button class="qh-note-remove" type="button" aria-label="Remover nota">&times;</button>
      <textarea placeholder="Digite sua anotação...">${note.text || ""}</textarea>
      <div class="qh-note-curl" aria-hidden="true"></div>
    `;
    layer.appendChild(noteEl);
    attachNoteInteractions(noteEl);
    return noteEl;
  }

  async function loadNotes() {
    if (!IS_TOP) return;
    ensureNotesLayer();
    notesLayer.innerHTML = "";
    const notes = await getStoredNotes();
    notes.forEach(renderNote);
  }

  async function createNote() {
    if (!IS_TOP) return { ok: false, error: "Notas só podem ser usadas na página principal." };
    const existing = collectNotesFromDom();
    const note = getDefaultNote(existing.length);
    renderNote(note);
    await saveNotes([...existing, note]);
    document.querySelector(`.qh-note[data-note-id="${note.id}"] textarea`)?.focus();
    return { ok: true };
  }

  async function clearNotes() {
    document.querySelectorAll(".qh-note").forEach((note) => note.remove());
    await saveNotes([]);
    return { ok: true };
  }

  async function applyLockVisuals(amount) {
    tabState.lockActive = true;
    if (IS_TOP) {
      await ensureOverlay();
      if (overlay) {
        overlay.style.display = "grid";
        overlay.querySelector("#qh-lock-input")?.focus();
      }
    }
    setBlur(amount ?? tabState.blurAmount);
    renderFabVisibility();
  }

  function clearLockVisuals() {
    tabState.lockActive = false;
    if (IS_TOP && overlay) overlay.style.display = "none";
    clearBlur();
    renderFabVisibility();
  }

  function handleDocumentClick(event) {
    if (!highlightRemovalMode) return;
    const mark = event.target?.closest?.(`mark.${HIGHLIGHT_CLASS}`);
    if (!mark) return;
    event.preventDefault();
    event.stopPropagation();
    unwrapHighlight(mark);
    disableHighlightRemovalMode();
    showToast("Realce removido.");
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && highlightRemovalMode) {
      disableHighlightRemovalMode();
      showToast("Limpeza individual cancelada.");
    }
  }

  function applySettings(state) {
    tabState = {
      ...tabState,
      ...state,
      blurAmount: state?.blurAmount ?? tabState.blurAmount,
      floatingLockEnabled: state?.floatingLockEnabled !== false,
      floatingLockPosition: state?.floatingLockPosition ?? tabState.floatingLockPosition,
      floatingLockOpacity: typeof state?.floatingLockOpacity === "number" ? state.floatingLockOpacity : tabState.floatingLockOpacity,
      lockActive: !!state?.lockActive,
      tabId: state?.tabId ?? tabState.tabId,
    };

    if (IS_TOP) {
      ensureFloatingLockButton();
      applyFabPosition(getFabPosition());
      renderFabVisibility();
    }

    if (tabState.lockActive) setBlur(tabState.blurAmount);
    else clearBlur();
  }

  chrome.runtime?.onMessage?.addListener?.((msg, _sender, sendResponse) => {
    (async () => {
      switch (msg?.type) {
        case "PRIVACY/HIGHLIGHT_SELECTION":
          sendResponse?.({ ok: highlightSelection(msg.payload?.color || "#fff59d") });
          return;
        case "PRIVACY/CLEAR_HIGHLIGHTS":
          clearHighlights();
          disableHighlightRemovalMode();
          sendResponse?.({ ok: true });
          return;
        case "PRIVACY/ENABLE_HIGHLIGHT_REMOVE_MODE":
          enableHighlightRemovalMode();
          sendResponse?.({ ok: true });
          return;
        case "PRIVACY/CREATE_NOTE":
          sendResponse?.(await createNote());
          return;
        case "PRIVACY/CLEAR_NOTES":
          sendResponse?.(await clearNotes());
          return;
        case "PRIVACY/APPLY_LOCK_VISUALS":
          await applyLockVisuals(msg.payload?.amount);
          sendResponse?.({ ok: true });
          return;
        case "PRIVACY/CLEAR_LOCK_VISUALS":
          clearLockVisuals();
          sendResponse?.({ ok: true });
          return;
        case "PRIVACY/SETTINGS_UPDATED":
          applySettings(msg.payload || msg);
          sendResponse?.({ ok: true });
          return;
        case "PRIVACY_TOGGLE":
          if (document.documentElement.classList.contains("qh-locked-blur")) clearLockVisuals();
          else await applyLockVisuals(tabState.blurAmount);
          sendResponse?.({ ok: true });
          return;
        default:
          sendResponse?.({ ok: false });
      }
    })();
    return true;
  });

  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  if (IS_TOP) {
    ensureFloatingLockButton();
    loadNotes();
    window.addEventListener("resize", () => {
      if (!fab) return;
      applyFabPosition({
        x: parseInt(fab.style.left || `${getFabPosition().x}`, 10),
        y: parseInt(fab.style.top || `${getFabPosition().y}`, 10),
      });
    });
  }

  safeRuntimeSend({ type: "PRIVACY/GET_TAB_STATE" }).then((response) => {
    const state = response?.payload || response;
    if (!state) return;
    applySettings(state);
    if (state.lockActive) applyLockVisuals(state.blurAmount);
  });
})();
