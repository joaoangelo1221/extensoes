const STORAGE_KEY = "favsitesData";
const SCHEMA_VERSION = 2;
const DEFAULT_DIRECTORY_NAME = "Diretorio 1";

const DEFAULT_DATA = {
  schemaVersion: SCHEMA_VERSION,
  directories: {
    Geral: [],
    [DEFAULT_DIRECTORY_NAME]: [],
  },
  settings: {
    mergeDuplicates: true,
    theme: "system",
    selectedDirectory: DEFAULT_DIRECTORY_NAME,
    masterPasswordHash: null,
    directoryOrder: [],
  },
  trash: [],
};

function cloneDefaultData() {
  return structuredClone(DEFAULT_DATA);
}

function normalizeSite(item) {
  if (!item || typeof item !== "object") return null;

  return {
    id: item.id || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: item.title || item.url || "",
    url: item.url || "",
    favicon: item.favicon || "",
    pinned: !!item.pinned,
    highlight: item.highlight || "",
    notes: item.notes || "",
    reminders: Array.isArray(item.reminders) ? item.reminders.filter(Boolean) : [],
    credentials: item.credentials || null,
    visitCount: Number.isFinite(item.visitCount) ? item.visitCount : 0,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
  };
}

function normalizeData(raw) {
  const base = cloneDefaultData();
  const data = raw && typeof raw === "object" ? raw : {};

  const directories = {};
  const sourceDirectories = data.directories && typeof data.directories === "object" ? data.directories : {};
  Object.entries(sourceDirectories).forEach(([name, items]) => {
    directories[name] = Array.isArray(items) ? items.map(normalizeSite).filter(Boolean) : [];
  });
  if (!directories.Geral) directories.Geral = [];
  const sourceDirectoryNames = Object.keys(sourceDirectories);
  const initialUserDirectories = Object.keys(directories).filter((name) => name !== "Geral");
  if (sourceDirectoryNames.length === 0 && initialUserDirectories.length === 0) {
    directories[DEFAULT_DIRECTORY_NAME] = [];
  }
  if (directories.Geral.length) {
    const targetDirectory = initialUserDirectories[0] || DEFAULT_DIRECTORY_NAME;
    directories[targetDirectory] = Array.isArray(directories[targetDirectory]) ? directories[targetDirectory] : [];
    directories[targetDirectory].push(...directories.Geral);
    directories.Geral = [];
  }

  const settings = {
    ...base.settings,
    ...(data.settings && typeof data.settings === "object" ? data.settings : {}),
  };
  if (!Array.isArray(settings.directoryOrder)) settings.directoryOrder = [];
  settings.directoryOrder = settings.directoryOrder.filter(
    (name, index, list) => name && name !== "Geral" && list.indexOf(name) === index && !!directories[name]
  );

  const userDirectories = Object.keys(directories).filter((name) => name !== "Geral");
  userDirectories.forEach((name) => {
    if (!settings.directoryOrder.includes(name)) settings.directoryOrder.push(name);
  });

  const trash = Array.isArray(data.trash)
    ? data.trash
        .map((entry) => {
          if (!entry || typeof entry !== "object" || !entry.item) return null;
          return {
            id: entry.id || `trash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            item: normalizeSite(entry.item),
            originalDirectory: entry.originalDirectory || "Geral",
            deletedAt: Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now(),
          };
        })
        .filter(Boolean)
    : [];

  if (!directories[settings.selectedDirectory] && settings.selectedDirectory !== "Geral") {
    settings.selectedDirectory = userDirectories[0] || "Geral";
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    directories,
    settings,
    trash,
  };
}

function readArea(area, key = STORAGE_KEY) {
  return new Promise((resolve) => {
    area.get([key], (result) => resolve(result?.[key] ?? null));
  });
}

function writeArea(area, value) {
  return new Promise((resolve, reject) => {
    area.set({ [STORAGE_KEY]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

async function findLegacyData() {
  const localNamespaced = await readArea(chrome.storage.local);
  if (localNamespaced) return localNamespaced;

  const syncNamespaced = await readArea(chrome.storage.sync);
  if (syncNamespaced) return syncNamespaced;

  const localAll = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
  if (localAll?.directories || localAll?.settings || localAll?.trash) return localAll;

  const syncAll = await new Promise((resolve) => chrome.storage.sync.get(null, resolve));
  if (syncAll?.directories || syncAll?.settings || syncAll?.trash) return syncAll;

  return null;
}

async function loadAndMigrateData() {
  const raw = await findLegacyData();
  const normalized = normalizeData(raw);
  await writeArea(chrome.storage.local, normalized);
  return normalized;
}

export async function getData() {
  const stored = await readArea(chrome.storage.local);
  if (stored) return normalizeData(stored);
  return loadAndMigrateData();
}

export async function setData(data) {
  const normalized = normalizeData(data);
  await writeArea(chrome.storage.local, normalized);
}

export async function updateData(updater) {
  const current = await getData();
  const workingCopy = structuredClone(current);
  const updated = await updater(workingCopy);
  await setData(updated || workingCopy);
}
