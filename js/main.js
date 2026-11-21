import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas3d");
const info = document.getElementById("info");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0b);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  500000
);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

function collectBounds(features) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (!Number.isNaN(elev)) {
      if (elev < minZ) minZ = elev;
      if (elev > maxZ) maxZ = elev;
    }
    const geom = f.geometry;
    if (!geom) continue;
    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring) continue;
      for (const pt of ring) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat, minZ, maxZ };
}

function makeProjector(bounds) {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((midLat * Math.PI) / 180);
  return function (lon, lat) {
    return [
      (lon - bounds.minLon) * mPerDegLon,
      (lat - bounds.minLat) * mPerDegLat
    ];
  };
}

function colorOuter(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  const v = Math.floor(35 + t * 35);
  return new THREE.Color(`rgb(\( {v}, \){v},${v + 15})`);
}

function colorMid(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  const r = Math.floor(40 + t * 50);
  const g = Math.floor(55 + t * 55);
  const b = Math.floor(80 + t * 50);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

function colorCore(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  const r = Math.floor(50 + t * 170);
  const g = Math.floor(150 + t * 70);
  const b = Math.floor(70 - t * 30);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

function buildLineLayer(features, project, zMin, zMax, colorFn, opacity) {
  const group = new THREE.Group();
  let count = 0;

  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;

    const geom = f.geometry;
    if (!geom) continue;
    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;

    const z = elev - zMin;
    const color = colorFn(elev, zMin, zMax);

    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 2) continue;

      const positions = new Float32Array(ring.length * 3);
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        positions[i * 3] = x;
        positions[i * 3 + 1] = z;
        positions[i * 3 + 2] = y;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity
      });
      group.add(new THREE.Line(geometry, material));
      count++;
    }
  }
  return { group, count };
}

// ========== BOD 1: heightmap ==========

/** Vzorky (x,y,z) z CORE vrstevníc */
function collectSamples(features, project, stride = 3) {
  const samples = [];
  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;
    const geom = f.geometry;
    if (!geom) continue;
    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring) continue;
      for (let i = 0; i < ring.length; i += stride) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        samples.push({ x, y, z: elev });
      }
    }
  }
  return samples;
}

/**
 * Heightmap: mriežka výšok nad CORE.
 * Zatiaľ len najbližšia vzorka (nearest) – bez hladkej interpolácie.
 * Bod 2 doplní bilinear / IDW.
 */
function buildHeightmapNearest(samples, boundsXY, resolution) {
  const { minX, maxX, minY, maxY } = boundsXY;
  const cols = resolution;
  const rows = resolution;
  const heights = new Float32Array(cols * rows);

  // priestorová mriežka na rýchle hľadanie
  const cellSize = Math.max(maxX - minX, maxY - minY) / 32;
  const grid = new Map();
  const key = (cx, cy) => cx + "," + cy;

  for (const s of samples) {
    const cx = Math.floor((s.x - minX) / cellSize);
    const cy = Math.floor((s.y - minY) / cellSize);
    const k = key(cx, cy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
  }

  function nearby(x, y) {
    const cx = Math.floor((x - minX) / cellSize);
    const cy = Math.floor((y - minY) / cellSize);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = grid.get(key(cx + dx, cy + dy));
        if (list) for (const s of list) out.push(s);
      }
    }
    return out.length ? out : samples;
  }

  let hMin = Infinity;
  let hMax = -Infinity;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / (cols - 1)) * (maxX - minX);
      const y = minY + (j / (rows - 1)) * (maxY - minY);

      const candidates = nearby(x, y);
      let best = candidates[0];
      let bestD = Infinity;
      for (const s of candidates) {
        const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      const h = best.z;
      heights[j * cols + i] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }

  return { heights, cols, rows, minX, maxX, minY, maxY, hMin, hMax };
}

/** Malý 2D náhľad heightmapy (kontrola bodu 1) */
function showHeightmapPreview(heightmap) {
  let preview = document.getElementById("hmPreview");
  if (!preview) {
    preview = document.createElement("canvas");
    preview.id = "hmPreview";
    preview.width = 160;
    preview.height = 160;
    preview.style.cssText =
      "position:fixed;left:12px;bottom:12px;width:160px;height:160px;" +
      "border:1px solid #444;image-rendering:pixelated;z-index:20;background:#111;";
    document.body.appendChild(preview);
  }
  const ctx = preview.getContext("2d");
  const { heights, cols, rows, hMin, hMax } = heightmap;
  const img = ctx.createImageData(cols, rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const h = heights[j * cols + i];
      const t = hMax === hMin ? 0.5 : (h - hMin) / (hMax - hMin);
      // zelená → hnedá
      const r = Math.floor(45 + t * 140);
      const g = Math.floor(110 - t * 40);
      const b = Math.floor(50 - t * 20);
      const idx = ((rows - 1 - j) * cols + i) * 4; // y hore
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  // vykresli do 160x160
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  off.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 160, 160);
  ctx.drawImage(off, 0, 0, 160, 160);
}

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Nepodarilo sa nacitat " + url);
  return res.json();
}

// globálne – neskôr použijeme v bode 2 a 3
window.__heightmap = null;

async function init() {
  try {
    info.textContent = "Nacitam 3 vrstvy...";

    const [outerJson, midJson, coreJson] = await Promise.all([
      loadGeoJSON("data/contours_outer.geojson"),
      loadGeoJSON("data/contours_bg.geojson"),
      loadGeoJSON("data/contours.geojson")
    ]);

    const outerFeatures = outerJson.features || [];
    const midFeatures = midJson.features || [];
    const coreFeatures = coreJson.features || [];

    const outerBounds = collectBounds(outerFeatures);
    const coreBounds = collectBounds(coreFeatures);

    const project = makeProjector(outerBounds);

    const zMin = coreBounds.minZ;
    const zMax = coreBounds.maxZ;

    const outer = buildLineLayer(outerFeatures, project, zMin, zMax, colorOuter, 0.22);
    scene.add(outer.group);

    const mid = buildLineLayer(midFeatures, project, zMin, zMax, colorMid, 0.45);
    scene.add(mid.group);

    const core = buildLineLayer(coreFeatures, project, zMin, zMax, colorCore, 1.0);
    scene.add(core.group);

    // ----- BOD 1 -----
    info.textContent = "Bod 1: tvorim heightmap...";
    const samples = collectSamples(coreFeatures, project, 3);

    const [x0, y0] = project(coreBounds.minLon, coreBounds.minLat);
    const [x1, y1] = project(coreBounds.maxLon, coreBounds.maxLat);
    const boundsXY = {
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1),
      maxY: Math.max(y0, y1)
    };

    const RESOLUTION = 128;
    const heightmap = buildHeightmapNearest(samples, boundsXY, RESOLUTION);
    window.__heightmap = heightmap;
    showHeightmapPreview(heightmap);

    // kamera na core čiary
    const box = new THREE.Box3().setFromObject(core.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    controls.target.copy(center);
    camera.position.set(
      center.x + maxDim * 0.95,
      center.y + maxDim * 0.55,
      center.z + maxDim * 0.95
    );
    camera.near = maxDim / 3000;
    camera.far = maxDim * 150;
    camera.updateProjectionMatrix();
    controls.update();

    info.textContent =
      "BOD 1 OK | samples " + samples.length +
      " | map " + RESOLUTION + "x" + RESOLUTION +
      " | h " + Math.round(heightmap.hMin) + "–" + Math.round(heightmap.hMax) + " m" +
      " | Outer " + outer.count + " Mid " + mid.count + " Core " + core.count;
  } catch (err) {
    console.error(err);
    info.textContent = "CHYBA: " + err.message;
    info.style.color = "#f87171";
  }
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
animate();
