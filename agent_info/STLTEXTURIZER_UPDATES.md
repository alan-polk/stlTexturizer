# BumpMesh / stlTexturizer — Fork work summary

This document summarizes changes and workflows developed on **alan-polk/stlTexturizer** (fork of **[CNCKitchen/stlTexturizer](https://github.com/CNCKitchen/stlTexturizer)**) so another agent can continue a side project without re-deriving context.

---

## 1. Repository layout

| Remote | Purpose |
|--------|---------|
| `origin` | Fork: `https://github.com/alan-polk/stlTexturizer.git` |
| `upstream` | Upstream: `https://github.com/CNCKitchen/stlTexturizer.git` |

**Default upstream branch:** `main` (also `develop` exists).

**Local project path (example):** `/Volumes/4TB-NVME/github/stlTexturizer` — external volumes can affect macOS Launch Agent paths; reinstall scripts if the repo moves.

---

## 2. Branches (important)

| Branch | Role |
|--------|------|
| **`Project-Feature`** | **Primary fork integration branch** — profiles, project ZIP saves, fixed world texture scale, rebased onto upstream `main`. Tracks `origin/Project-Feature`. Use this for day-to-day fork work. |
| **`main` (local + `origin/main`)** | Synced to **`upstream/main`** (force-pushed once) so the fork’s `main` matches CNCKitchen for clean PR bases. |
| **`feature/fixed-world-texture-scale`** | **Standalone PR branch** — contains **only** the “fixed world texture scale” feature (no profile/project UI), intended for a PR **from the fork into CNCKitchen**. |

Other local branches may exist (e.g. `Profile-Feature`); treat **`Project-Feature`** as the consolidated fork line unless stated otherwise.

---

## 3. Upstream vs fork: what came from where

### From upstream (merged via rebase)

- Recent CNCKitchen work: e.g. **texture thumbnails**, **lazy-loaded i18n** (`js/i18n.js` registry + `js/i18n/<lang>.js`), **AGPL**, **3MF fixes**, **Firefox fixes**, **precision masking**, **export 3MF**, wide wireframe, etc.
- **BumpMesh** branding, live site at `bumpmesh.com`.

### Fork-specific additions (on `Project-Feature`)

These are the main custom features:

1. **Profiles** — save/load **texture + all settings + exclusion UI** as JSON; named profiles in **localStorage**; import/export files; sticky re-apply after loading a new STL; save modal.
2. **Project files** — **ZIP** containing `manifest.json` + original **model bytes** under `model/`, full **profile** payload, and **surface mask** data (`excludedFaceIndices` mapped to **original mesh** triangle indices when precision masking is used).
3. **Fixed world texture scale** — optional **Transform** control: normalize UVs with a **fixed length in mm** (`referenceExtentMm`) instead of each mesh’s **largest bounding-box edge**, so physical pattern size is more consistent across different parts when using the same settings.
4. **Supporting plumbing** — `loadModelFileFromBuffer`, `geometryToSTLBinary` (fast STL buffer for projects), `applyProfilePayload` options (e.g. `skipBaseline`), last-loaded model bytes for project save, imprint text updated for localStorage where relevant.

---

## 4. Feature details

### 4.1 Profiles (`js/profiles.js`)

- Schema: `BumpMeshProfile`, `version: 1`.
- Storage key: `stlt-bumpmesh-profiles-v1`.
- Payload includes: **`settings`** (spread of app settings), **`texture`** (`preset` by name or `custom` with PNG **data URL**), **`exclusionUi`** (selection mode, brush type, diameters, bucket threshold).
- Validation: `validateProfile()` before apply.
- UI: dropdown, Save (modal), Export/Import JSON — wired in `main.js`, `index.html`, `style.css`.

### 4.2 Project ZIP (`js/projectFile.js`)

- Schema: `BumpMeshProject`, `version: 1`.
- ZIP layout: **`manifest.json`** + **`model/<sanitized-filename>`** (raw STL/OBJ/3MF bytes as loaded).
- Manifest: `profile` (full validated profile object), `surfaceMask.excludedFaceIndices`, `modelFileName`, `savedAt`.
- **Precision masking:** indices are folded to **original mesh** faces via `getOriginalExcludedFaceIndices()` / parent map so saves stay consistent when refining geometry.
- **Warning path:** saving masks on the **default cube** without a real file should warn users (triangle order changes if cube is re-exported as STL).
- Uses **`geometryToSTLBinary`** from `exporter.js` when embedding mesh from current geometry where applicable.

### 4.3 Preset textures (`js/presetTextures.js`)

- Upstream uses **`loadAllThumbnails`**, **`loadFullPreset`**, **`IMAGE_PRESETS`** (thumbnail-first loading).
- Fork adds **`loadTextureFromDataUrl`** for restoring custom maps from profile JSON.

### 4.4 Fixed world texture scale (`js/mapping.js`, `js/previewMaterial.js`, `js/displacement.js`, `main.js`, `index.html`, i18n)

- **`getReferenceExtent(settings, bounds)`** — returns either **`max(bounds.size)`** (legacy) or **`referenceExtentMm`** when **`settings.fixedWorldTextureScale`** is true.
- Used everywhere **`md`** was used for **planar / triplanar / cubic** paths on CPU and in the preview shader.
- **Cylindrical / spherical:** still primarily **mesh-based** (radii, angles); tooltip notes this limitation.
- Settings: **`fixedWorldTextureScale`** (bool), **`referenceExtentMm`** (default e.g. 200).
- Profile merge: if an old profile JSON lacks these keys, defaults are applied so behavior stays predictable.

**Why it was needed:** Default UV math divides by each mesh’s **max bbox dimension** (`md`). Two different STLs with the same “profile” therefore showed **different physical hex / feature sizes**. Fixed reference extent makes **mm-per-pattern** more consistent across parts.

### 4.5 `stlLoader.js` / `exporter.js`

- **`loadModelFileFromBuffer(arrayBuffer, fileName)`** — unified entry for project restore and file load; returns geometry + bounds + NaN/degenerate counts where implemented.
- **`geometryToSTLBinary(geometry)`** — shares the **fast** binary STL path with download export (no duplicate STLExporter path).

### 4.6 Internationalization

- **`js/i18n.js`** — minimal registry (language display names); strings live in **`js/i18n/en.js`**, **`de.js`**, etc.
- Fork-added keys include **profile.\***, **project.\***, **fixed world texture** labels/tooltips, and updated **imprint** line where localStorage mentions saved profiles.

---

## 5. macOS Launch Agent (`scripts/`)

Scripts support running **`python3 -m http.server`** from the **repo root** at login (ES modules require HTTP, not `file://`).

| File | Role |
|------|------|
| `scripts/start-bumpmesh-server.sh` | Foreground server on port **8000**, `0.0.0.0` bind option in script |
| `scripts/com.stltexturizer.http.plist.in` | Template for `launchd` |
| `scripts/install-launchagent.sh` / `uninstall-launchagent.sh` | Install/remove user Launch Agent |

**Note:** `WorkingDirectory` should be the repo; avoid relying on scripts on unmounted `/Volumes/...` paths for sandbox reasons. Re-run install if **`python3`** path or repo path changes.

---

## 6. Git hygiene

- **`STL Samples/`** — added to **`.gitignore`** (local test STLs; not for the repo).
- **Rebase workflow used:** `git fetch upstream` → `git rebase upstream/main` on feature branch → resolve conflicts (notably **`main.js`**, **`i18n.js`** — prefer upstream lazy i18n + merge fork strings into **`js/i18n/en.js`** / **`de.js`**).
- **Standalone PR:** cherry-picking the full “world scale” commit onto clean `main` failed because it was created on top of **profile/project** `main.js`. The PR branch was rebuilt by **patching** `mapping.js` / `displacement.js` / `previewMaterial.js` from the diff and **hand-merging** `main.js` / `index.html` / i18n **without** profile/project UI.

---

## 7. README

- Includes an optional **Launch Agent** subsection (commands to bootout/bootstrap `launchctl`, or reinstall scripts).
- License remains **AGPL** per upstream; do not replace with MIT in README.

---

## 8. Running locally

```bash
cd /path/to/stlTexturizer
python3 -m http.server 8000 --bind 127.0.0.1
# Open http://localhost:8000
```

No build step; dependencies are CDN (Three.js, fflate, etc.).

---

## 9. Open PR (upstream) — reference

Fixed-scale-only branch (fork → CNCKitchen):

- Compare: **`CNCKitchen/stlTexturizer` `main`** ← **`alan-polk/stlTexturizer` `feature/fixed-world-texture-scale`**

Full fork features remain on **`Project-Feature`** until separately proposed.

---

## 10. File checklist (fork-specific / heavily touched)

| Area | Files |
|------|--------|
| Profiles | `js/profiles.js`, `main.js`, `index.html`, `style.css` |
| Projects | `js/projectFile.js`, `main.js`, `index.html`, `style.css` |
| Loader / export | `js/stlLoader.js`, `js/exporter.js` |
| Textures | `js/presetTextures.js` |
| UV / preview / bake | `js/mapping.js`, `js/previewMaterial.js`, `js/displacement.js` |
| i18n | `js/i18n.js`, `js/i18n/en.js`, `js/i18n/de.js`, (+ other langs as needed) |
| Launch Agent | `scripts/*` |
| Ignore | `.gitignore` (`STL Samples/`) |
| Docs | `README.md`, **`agent_info/STLTEXTURIZER_UPDATES.md`** (this file) |

---

## 11. Suggested handoff notes for a new agent

1. Confirm branch: **`git checkout Project-Feature`** and **`git pull origin Project-Feature`**.
2. Use **`upstream/main`** as the source of truth for merges/rebases.
3. When adding UI strings, extend **`js/i18n/en.js`** (and **`de.js`** at minimum); avoid bloating `js/i18n.js` with full string tables (upstream pattern).
4. Test profiles and projects with **thumbnails + full preset load** flow; project ZIP round-trip (model + mask + profile).
5. For **fixed world scale**, verify both **preview** and **exported STL** match expectations on two different-sized STLs.

---

*Generated for agent handoff. Update this file when major fork behavior changes.*
