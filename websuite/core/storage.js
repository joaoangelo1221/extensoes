const DEFAULT_AREA = chrome.storage.local;

export async function getNamespace(namespace, fallback = {}) {
  const data = await DEFAULT_AREA.get([namespace]);
  return data?.[namespace] ?? fallback;
}

export async function setNamespace(namespace, value) {
  await DEFAULT_AREA.set({ [namespace]: value });
  return value;
}

export async function updateNamespace(namespace, updater, fallback = {}) {
  const current = await getNamespace(namespace, fallback);
  const draft = structuredClone(current);
  const next = await updater(draft);
  const finalValue = next === undefined ? draft : next;
  await setNamespace(namespace, finalValue);
  return finalValue;
}
