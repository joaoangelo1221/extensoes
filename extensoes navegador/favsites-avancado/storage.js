// lib/storage.js
// Abstrai o acesso ao armazenamento Chrome com fallback automático para
// chrome.storage.local quando chrome.storage.sync exceder cota ou não
// estiver disponível. Fornece funções getData, setData e updateData
// que operam sobre o objeto completo de dados da extensão. O objeto
// contém duas chaves: `directories` e `settings`. As funções retornam
// valores padrão quando nada está armazenado.

const DEFAULT_DATA = {
  directories: {
    // Diretório padrão será criado pelo instalador
  },
  settings: {
    mergeDuplicates: true,
    theme: 'system',
    selectedDirectory: 'Geral',
    masterPasswordHash: null // hash sha256 da senha-mestra definida pelo usuário
  }
};

// Área de armazenamento em uso (sync ou local). Começamos com sync.
let storageArea = chrome.storage.sync;

/**
 * Obtém todos os dados persistidos. Caso nada esteja salvo, retorna
 * uma cópia de DEFAULT_DATA. Se a leitura falhar, alterna para
 * storage.local e tenta novamente.
 * @returns {Promise<Object>}
 */
export async function getData() {
  return new Promise((resolve) => {
    storageArea.get(null, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Erro ao ler storage.sync, alternando para local:', chrome.runtime.lastError);
        storageArea = chrome.storage.local;
        storageArea.get(null, (result2) => {
          resolve(Object.assign({}, DEFAULT_DATA, result2));
        });
      } else {
        resolve(Object.assign({}, DEFAULT_DATA, result));
      }
    });
  });
}

/**
 * Persiste o objeto de dados completo na área atual. Se falhar, alterna
 * para storage.local. Não retorna dados.
 * @param {Object} data
 */
export async function setData(data) {
  return new Promise((resolve) => {
    storageArea.set(data, () => {
      if (chrome.runtime.lastError) {
        console.warn('Erro ao salvar em storage.sync, alternando para local:', chrome.runtime.lastError);
        storageArea = chrome.storage.local;
        storageArea.set(data, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Atualiza parcialmente os dados existentes. Lê o estado atual,
 * aplica as alterações via função updater e persiste o resultado.
 * @param {Function} updater Função que recebe o estado atual e
 *                           modifica-o in-place ou retorna novo estado.
 */
export async function updateData(updater) {
  const data = await getData();
  const updated = (await updater(data)) || data;
  await setData(updated);
}
