// Hardcoded list of sample textures shipped under /textures/.
// Indexed positions are stable (used in shared URLs) — do not reorder.
export const SAMPLE_TEXTURES = [
  '1.jpg', '10.jpg', '11.jpg', '13.jpg', '16.jpg', '19.jpg',
  '1rger.jpg', '2.jpg', '21.jpg', '22.jpg', '24.jpg', '25.jpg',
  '2er.jpg', '3.jpg', '3erg.jpg', '4.jpg', '5.jpg', '5erg.jpg',
  '6.jpg', '6erg.jpg', '7.jpg', '7ergre.jpg', '8.jpg', '8erre.jpg',
  '9.jpg', '9ergre.jpg', 'erg4.jpg', 'regre.jpg',
];

const IDB_DB_NAME = 'caostar';
const IDB_STORE = 'textures';
const IDB_KEY = 'custom';

class TextureManager {
  constructor() {
    this.cache = new Map();
    this.customDataUrl = null;
  }

  sampleSrc(index) {
    return `chaos-star-generator-files/textures/${SAMPLE_TEXTURES[index]}`;
  }

  load(src) {
    if (this.cache.has(src)) return Promise.resolve(this.cache.get(src));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this.cache.set(src, img); resolve(img); };
      img.onerror = (e) => reject(new Error('Failed to load texture: ' + src));
      img.src = src;
    });
  }

  async loadSample(index) {
    return this.load(this.sampleSrc(index));
  }

  async loadCustomFromFile(file) {
    const dataUrl = await readFileAsDataURL(file);
    this.customDataUrl = dataUrl;
    const img = await this.load(dataUrl);
    await idbSetCustom(dataUrl).catch(() => {}); // best-effort persistence
    return img;
  }

  async loadStoredCustom() {
    if (this.customDataUrl) return this.load(this.customDataUrl);
    const stored = await idbGetCustom().catch(() => null);
    if (!stored) return null;
    this.customDataUrl = stored;
    return this.load(stored);
  }

  hasCustom() {
    return !!this.customDataUrl;
  }

  async clearCustom() {
    this.customDataUrl = null;
    await idbClearCustom().catch(() => {});
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- IndexedDB helpers ---------- */

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSetCustom(dataUrl) {
  return openIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(dataUrl, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGetCustom() {
  return openIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbClearCustom() {
  return openIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

export const textureManager = new TextureManager();
