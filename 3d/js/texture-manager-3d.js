// Three.js-friendly texture loader. Re-uses the 2D app's SAMPLE_TEXTURES list
// and the same IndexedDB store (`caostar.textures`) for custom uploads.

import * as THREE from 'three';
import { SAMPLE_TEXTURES } from '../../chaos-star-generator-files/js/texture-manager.js';

export { SAMPLE_TEXTURES };

const IDB_DB_NAME = 'caostar';
const IDB_STORE   = 'textures';
const IDB_KEY     = 'custom';

const loader = new THREE.TextureLoader();
const cache  = new Map();
let cachedCustomDataUrl = null;

function configureTexture(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function sampleUrl(index) {
  const safe = Math.max(0, Math.min(SAMPLE_TEXTURES.length - 1, index | 0));
  return `../chaos-star-generator-files/textures/${SAMPLE_TEXTURES[safe]}`;
}

export function loadSample(index) {
  const url = sampleUrl(index);
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return new Promise((resolve) => {
    loader.load(url,
      (t) => { configureTexture(t); cache.set(url, t); resolve(t); },
      undefined,
      () => resolve(null));
  });
}

export function loadCustom(dataUrl) {
  if (cache.has(dataUrl)) return Promise.resolve(cache.get(dataUrl));
  return new Promise((resolve) => {
    loader.load(dataUrl,
      (t) => { configureTexture(t); cache.set(dataUrl, t); resolve(t); },
      undefined,
      () => resolve(null));
  });
}

export async function loadStoredCustom() {
  if (cachedCustomDataUrl) return loadCustom(cachedCustomDataUrl);
  const stored = await idbGet().catch(() => null);
  if (!stored) return null;
  cachedCustomDataUrl = stored;
  return loadCustom(stored);
}

export function hasCustom() { return !!cachedCustomDataUrl; }

export async function setCustomFromFile(file) {
  const dataUrl = await readAsDataURL(file);
  cachedCustomDataUrl = dataUrl;
  await idbSet(dataUrl).catch(() => {});
  return loadCustom(dataUrl);
}

export async function clearCustom() {
  cachedCustomDataUrl = null;
  await idbDelete().catch(() => {});
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------- IndexedDB ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
function idbSet(dataUrl) {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(dataUrl, IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}
function idbGet() {
  return openDb().then(db => new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}
function idbDelete() {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}
