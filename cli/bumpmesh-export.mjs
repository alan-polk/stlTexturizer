#!/usr/bin/env node
/**
 * Headless BumpMesh export from a saved project ZIP (same format as browser
 * "Save project…"). Bypasses browser memory limits — run with a large heap if needed:
 *   node --max-old-space-size=16384 cli/bumpmesh-export.mjs project.zip -o out.stl
 *
 * Requires: npm install (from repository root). Preset textures are read from
 * ./textures relative to --repo-root (default: parent of cli/).
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';
import * as THREE from 'three';

import { parseProjectZip } from '../js/projectFile.js';
import { validateProfile } from '../js/profiles.js';
import { loadModelFileFromBuffer, computeBounds } from '../js/stlLoader.js';
import { subdivide } from '../js/subdivision.js';
import { applyDisplacement } from '../js/displacement.js';
import { decimate } from '../js/decimation.js';
import { geometryToSTLBinary } from '../js/exporter.js';
import { buildFaceWeights } from '../js/exclusion.js';
import { IMAGE_PRESETS } from '../js/presetTextures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

const SIZE = 512;

function fitDimensions(imgW, imgH) {
  const scale = Math.min(SIZE / imgW, SIZE / imgH, 1);
  return { w: Math.round(imgW * scale), h: Math.round(imgH * scale) };
}

/** Defaults aligned with js/main.js `settings` (subset used by export). */
const DEFAULT_SETTINGS = {
  mappingMode: 5,
  scaleU: 0.5,
  scaleV: 0.5,
  amplitude: 0.5,
  offsetU: 0,
  offsetV: 0,
  rotation: 0,
  refineLength: 1.0,
  maxTriangles: 750_000,
  lockScale: true,
  bottomAngleLimit: 5,
  topAngleLimit: 0,
  mappingBlend: 1,
  seamBandWidth: 0.5,
  textureSmoothing: 0,
  capAngle: 20,
  boundaryFalloff: 0,
  symmetricDisplacement: false,
  useDisplacement: false,
  fixedWorldTextureScale: false,
  referenceExtentMm: 200,
};

/**
 * Same logic as main.js buildCombinedFaceWeights (subdivision + angle mask).
 */
function buildCombinedFaceWeights(geometry, excludedFaces, invert, settings) {
  const weights = buildFaceWeights(geometry, excludedFaces, invert);
  const hasAngleMask = settings.bottomAngleLimit > 0 || settings.topAngleLimit > 0;
  if (!hasAngleMask) return weights;

  const posAttr = geometry.attributes.position;
  const triCount = posAttr.count / 3;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNrm = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    if (weights[t * 3] > 0.99) continue;
    vA.fromBufferAttribute(posAttr, t * 3);
    vB.fromBufferAttribute(posAttr, t * 3 + 1);
    vC.fromBufferAttribute(posAttr, t * 3 + 2);
    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    faceNrm.crossVectors(edge1, edge2);
    const faceArea = faceNrm.length();
    const faceNzNorm = faceArea > 1e-12 ? faceNrm.z / faceArea : 0;
    const faceAngle = Math.acos(Math.abs(faceNzNorm)) * (180 / Math.PI);
    const angleMasked = faceNzNorm < 0
      ? (settings.bottomAngleLimit > 0 && faceAngle <= settings.bottomAngleLimit)
      : (settings.topAngleLimit > 0 && faceAngle <= settings.topAngleLimit);
    if (angleMasked) {
      weights[t * 3] = weights[t * 3 + 1] = weights[t * 3 + 2] = 1.0;
    }
  }
  return weights;
}

/**
 * Decode texture to ImageData-like { width, height, data } for applyDisplacement.
 */
async function loadDisplacementImageData(textureSpec, repoRoot) {
  if (!textureSpec || textureSpec.kind === 'none') {
    throw new Error('Project profile has no texture (kind none)');
  }
  let input;
  let rawW;
  let rawH;

  if (textureSpec.kind === 'custom') {
    const m = String(textureSpec.dataUrl || '').match(/^data:image\/\w+;base64,(.+)$/);
    if (!m) throw new Error('Invalid custom texture dataUrl in profile');
    input = Buffer.from(m[1], 'base64');
    const meta = await sharp(input).metadata();
    rawW = meta.width;
    rawH = meta.height;
  } else if (textureSpec.kind === 'preset') {
    const preset = IMAGE_PRESETS.find((p) => p.name === textureSpec.name);
    if (!preset) throw new Error(`Unknown preset texture: "${textureSpec.name}"`);
    const abs = path.join(repoRoot, ...preset.url.split('/'));
    input = await fsp.readFile(abs);
    const meta = await sharp(input).metadata();
    rawW = meta.width;
    rawH = meta.height;
  } else {
    throw new Error(`Unsupported texture kind: ${textureSpec.kind}`);
  }

  const { w, h } = fitDimensions(rawW, rawH);
  const { data, info } = await sharp(input)
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
}

function mergeSettings(profile) {
  const s = { ...DEFAULT_SETTINGS, ...profile.settings };
  if (!('fixedWorldTextureScale' in profile.settings)) s.fixedWorldTextureScale = false;
  if (!('referenceExtentMm' in profile.settings)) s.referenceExtentMm = 200;
  return s;
}

function applyBottomLayerClamp(geometry, bottomZ) {
  const pa = geometry.attributes.position.array;
  const na = geometry.attributes.normal
    ? geometry.attributes.normal.array
    : new Float32Array(pa.length);

  for (let i = 0; i < pa.length; i += 9) {
    let dirty = false;
    if (pa[i + 2] < bottomZ) { pa[i + 2] = bottomZ; dirty = true; }
    if (pa[i + 5] < bottomZ) { pa[i + 5] = bottomZ; dirty = true; }
    if (pa[i + 8] < bottomZ) { pa[i + 8] = bottomZ; dirty = true; }

    if (dirty) {
      const ux = pa[i + 3] - pa[i], uy = pa[i + 4] - pa[i + 1], uz = pa[i + 5] - pa[i + 2];
      const vx = pa[i + 6] - pa[i], vy = pa[i + 7] - pa[i + 1], vz = pa[i + 8] - pa[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      na[i] = na[i + 3] = na[i + 6] = nx / len;
      na[i + 1] = na[i + 4] = na[i + 7] = ny / len;
      na[i + 2] = na[i + 5] = na[i + 8] = nz / len;
    }
  }

  geometry.attributes.position.needsUpdate = true;
  if (!geometry.attributes.normal) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3));
  } else {
    geometry.attributes.normal.needsUpdate = true;
  }
}

function printHelp() {
  console.log(`BumpMesh headless export

Usage:
  node cli/bumpmesh-export.mjs <project.zip> [options]

Options:
  -o, --out <file.stl>     Output path (default: <modelBase>_bumpmesh.stl)
  --repo-root <dir>        Repo root containing textures/ (default: repository root)
  -h, --help               Show this help

Example:
  node --max-old-space-size=16384 cli/bumpmesh-export.mjs ./myproject.zip -o ./out.stl
`);
}

async function runExport(projectPath, outPath, repoRoot) {
  const buf = await fsp.readFile(projectPath);
  const { manifest, modelBytes, modelFileName } = parseProjectZip(buf);

  if (!validateProfile(manifest.profile)) {
    throw new Error('Invalid profile in manifest');
  }

  const profile = manifest.profile;
  const settings = mergeSettings(profile);

  console.log('Loading model:', modelFileName);
  const { geometry } = await loadModelFileFromBuffer(
    modelBytes.slice(0),
    modelFileName,
  );
  const bounds = computeBounds(geometry);
  const triCount = geometry.attributes.position.count / 3;

  const rawIndices = manifest.surfaceMask?.excludedFaceIndices;
  if (!Array.isArray(rawIndices)) {
    throw new Error('manifest.surfaceMask.excludedFaceIndices missing');
  }
  const excludedFaces = new Set(
    rawIndices.filter((i) => Number.isInteger(i) && i >= 0 && i < triCount),
  );
  const selectionMode = !!profile.exclusionUi?.selectionMode;

  const hasAngleMask = settings.bottomAngleLimit > 0 || settings.topAngleLimit > 0;
  const faceWeights =
    excludedFaces.size > 0 || selectionMode || hasAngleMask
      ? buildCombinedFaceWeights(geometry, excludedFaces, selectionMode, settings)
      : null;

  console.log('Loading displacement map…');
  const img = await loadDisplacementImageData(profile.texture, repoRoot);

  let subdivided = null;
  let displaced = null;
  let finalGeometry = null;

  try {
    console.log('Subdividing (resolution', settings.refineLength, 'mm)…');
    const subResult = await subdivide(
      geometry,
      settings.refineLength,
      (p, tc, edge) => {
        if (tc != null) {
          process.stdout.write(`\r  Subdivide… ~${tc.toLocaleString()} tris (pass)`);
        }
      },
      faceWeights,
    );
    subdivided = subResult.geometry;
    if (subResult.safetyCapHit) {
      console.warn('\n  [warn] Subdivision safety cap hit — mesh may be coarser than target edge length.');
    }
    console.log('');

    const subTri = subdivided.attributes.position.count / 3;
    console.log('Applying displacement…', subTri.toLocaleString(), 'triangles');
    displaced = applyDisplacement(
      subdivided,
      img,
      img.width,
      img.height,
      settings,
      bounds,
      () => {},
    );
    subdivided.dispose();
    subdivided = null;

    const dispTriCount = displaced.attributes.position.count / 3;
    finalGeometry = displaced;

    if (dispTriCount > settings.maxTriangles) {
      console.log(
        'Decimating…',
        dispTriCount.toLocaleString(),
        '→',
        settings.maxTriangles.toLocaleString(),
      );
      finalGeometry = await decimate(displaced, settings.maxTriangles, (p) => {
        if (p === 0 || p === 1) {
          process.stdout.write(`\r  Decimate… ${(p * 100).toFixed(0)}%`);
        }
      });
      console.log('');
      displaced.dispose();
      displaced = null;
    }

    if (settings.bottomAngleLimit > 0) {
      applyBottomLayerClamp(finalGeometry, bounds.min.z);
    }

    const stlBuffer = geometryToSTLBinary(finalGeometry);
    await fsp.writeFile(outPath, Buffer.from(stlBuffer));

    const mb = (stlBuffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log('Wrote', outPath, `(${mb} MB, binary STL)`);
  } finally {
    try {
      geometry.dispose();
    } catch (_) { /* noop */ }
    try {
      if (subdivided) subdivided.dispose();
    } catch (_) { /* noop */ }
    try {
      if (finalGeometry) finalGeometry.dispose();
      else if (displaced) displaced.dispose();
    } catch (_) { /* noop */ }
  }
}

function parseArgs(argv) {
  const args = { _: [], out: null, repoRoot: DEFAULT_REPO_ROOT, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--repo-root') args.repoRoot = path.resolve(argv[++i]);
    else if (!a.startsWith('-')) args._.push(a);
    else {
      console.error('Unknown option:', a);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.help || args._.length === 0) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const projectPath = path.resolve(args._[0]);
const repoRoot = args.repoRoot;

let baseName = 'bumpmesh_out';
try {
  const z = fs.readFileSync(projectPath);
  const { modelFileName } = parseProjectZip(z);
  baseName = modelFileName.replace(/\.(stl|obj|3mf)$/i, '');
} catch {
  // keep default
}

const outPath = args.out
  ? path.resolve(args.out)
  : path.join(path.dirname(projectPath), `${baseName}_bumpmesh.stl`);

await runExport(projectPath, outPath, repoRoot).catch((err) => {
  console.error('Export failed:', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
