/**
 * BumpMesh project files: ZIP containing manifest.json + model/ (original mesh bytes).
 */

import { zipSync, strToU8, unzipSync } from 'fflate';
import { validateProfile } from './profiles.js';

export const PROJECT_SCHEMA = 'BumpMeshProject';
export const PROJECT_VERSION = 1;

/** Basename only; safe for zip paths */
export function sanitizeModelFileName(name) {
  const base = name.replace(/^.*[/\\]/, '').replace(/\0/g, '');
  if (!base || base.length > 200) return 'model.stl';
  return base;
}

export function validateProjectManifest(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.$schema !== PROJECT_SCHEMA || m.version !== PROJECT_VERSION) return false;
  if (!validateProfile(m.profile)) return false;
  if (!m.surfaceMask || typeof m.surfaceMask !== 'object') return false;
  if (!Array.isArray(m.surfaceMask.excludedFaceIndices)) return false;
  if (typeof m.modelFileName !== 'string') return false;
  return true;
}

/**
 * @returns {Uint8Array} zipped bytes
 */
export function buildProjectZipBytes({ profile, surfaceMask, modelBytes, modelFileName }) {
  const safeBase = sanitizeModelFileName(modelFileName);
  const manifest = {
    $schema: PROJECT_SCHEMA,
    version: PROJECT_VERSION,
    profile,
    surfaceMask,
    modelFileName: safeBase,
    savedAt: new Date().toISOString(),
  };
  const pathSafe = safeBase.replace(/[^a-zA-Z0-9._-]/g, '_') || 'model.stl';
  const zipObj = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    [`model/${pathSafe}`]: new Uint8Array(modelBytes),
  };
  return zipSync(zipObj, { level: 6 });
}

/**
 * @param {ArrayBuffer|Uint8Array} zipBuffer
 * @returns {{ manifest: object, modelBytes: ArrayBuffer, modelFileName: string }}
 */
export function parseProjectZip(zipBuffer) {
  const u8 = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
  const files = unzipSync(u8);
  const keys = Object.keys(files);
  const manifestKey = keys.find(k => k === 'manifest.json' || k.endsWith('/manifest.json'));
  if (!manifestKey) throw new Error('manifest.json missing');
  const manifest = JSON.parse(new TextDecoder().decode(files[manifestKey]));
  if (!validateProjectManifest(manifest)) throw new Error('Invalid project manifest');

  const modelKey = keys.find(k => /^model\//.test(k) && !k.endsWith('/') && files[k].length > 0);
  if (!modelKey) throw new Error('Model file missing in archive');
  const src = files[modelKey];
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  const modelBytes = copy.buffer;
  return {
    manifest,
    modelBytes,
    modelFileName: manifest.modelFileName || modelKey.replace(/^model\//, ''),
  };
}
