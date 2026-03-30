// lib/crypto.js
// Fornece utilitários para criptografia e hash. Utiliza a API Web Crypto
// para derivar chaves a partir de uma senha e para criptografar/descriptografar
// textos com AES-GCM. Essas funções retornam Promises.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Calcula SHA-256 de uma string e retorna o resultado em base64.
 * @param {string} str
 * @returns {Promise<string>}
 */
export async function sha256(str) {
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode.apply(null, hashArray));
}

/**
 * Deriva uma chave AES-GCM (256 bits) a partir de uma senha usando PBKDF2.
 * O salt é fixo para simplificar o exemplo, mas poderia ser diferente por usuário.
 * @param {string} password
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password) {
  const pwUtf8 = encoder.encode(password);
  const baseKey = await crypto.subtle.importKey(
    'raw', pwUtf8, { name: 'PBKDF2' }, false, ['deriveKey']
  );
  // Salt fixo para demonstração. Em produção, use um salt aleatório por usuário.
  const salt = encoder.encode('favdirs-salt');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa o texto fornecido com a chave fornecida utilizando AES-GCM.
 * Retorna string base64 contendo IV concatenado com o ciphertext.
 * @param {string} text
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode.apply(null, combined));
}

/**
 * Descriptografa texto em base64 (IV + ciphertext) com a chave fornecida.
 * Retorna string original.
 * @param {string} b64
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function decrypt(b64, key) {
  const bytes = new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return decoder.decode(decrypted);
}