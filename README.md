# STL Texturizer

**Live demo:** https://cnckitchen.github.io/stlTexturizer/

A browser-based tool for applying surface displacement textures to STL files — no installation required.

Load any `.stl` file, pick a texture, tune the parameters, and export a new displaced STL ready for slicing.

## Features

- **Texture presets** — 12 built-in seamless textures (basket, brick, bubble, crystal, hexagon, knitting, knurling, leather, weave, wood, noise, and more)
- **Custom textures** — upload your own image as a displacement map
- **Projection modes** — Triplanar, Cubic (Box), Cylindrical, Spherical, Planar XY/XZ/YZ
- **UV transform** — independent U/V scale, offset, and rotation controls
- **Displacement amplitude** — fine-tune depth from subtle grain to deep relief
- **Surface mask** — skip horizontal top/bottom faces to keep flat surfaces clean
- **Surface exclusions / inclusions** — paint individual faces with a brush or bucket-fill to exclude or exclusively include them from displacement
- **Live preview** — real-time textured 3D preview with orbit/pan/zoom controls
- **Mesh subdivision** — auto-subdivides coarse geometry before displacement for smoother results
- **Export** — downloads a new binary STL with displacement baked in
- **Light / Dark theme** — persisted per browser
- **Multilingual** — English and German UI

## Usage

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
2. Drop an STL file onto the viewport or click **Load STL…**.
3. Select a texture preset from the sidebar (or upload a custom image).
4. Adjust projection mode, UV scale, offset, rotation, and amplitude.
5. Optionally mask or exclude surfaces with the brush/fill tools.
6. Click **Export STL** to download the displaced mesh.

> **Note:** All processing runs entirely in the browser — no data is uploaded to any server.

## Project Structure

```
index.html          # Main entry point
style.css           # Styles (light/dark theme)
textures/           # Built-in JPG displacement map images
js/
  main.js           # App bootstrap & UI wiring
  viewer.js         # Three.js scene / camera / controls
  stlLoader.js      # Binary & ASCII STL parser
  presetTextures.js # Built-in texture presets + custom upload
  previewMaterial.js# Three.js material for live preview
  mapping.js        # UV projection logic
  displacement.js   # Vertex displacement baking
  subdivision.js    # Mesh subdivision
  decimation.js     # QEM mesh decimation
  exclusion.js      # Face exclusion / inclusion painting
  exporter.js       # Binary STL export
  i18n.js           # Translations (EN / DE)
```

## Dependencies

Loaded via CDN — no build step needed:

- [Three.js](https://threejs.org/) v0.170.0

## License

MIT — see [LICENSE](LICENSE).
