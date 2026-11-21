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
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.55);
sun.position.set(120, 220, 90);
scene.add(sun);

const COLOR_LOW = new THREE.Color("#2d6a3e");
const COLOR_HIGH = new THREE.Color("#8b6914");
const COLOR_WATER = new THREE.Color("#1a5f8a");
const COLOR_WATER_LINE = new THREE.Color("#3a9fd4");

function colorByElevation(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  return COLOR_LOW.clone().lerp(COLOR_HIGH, Math.min(1, Math.max(0, t)));
}

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

  function project(lon, lat) {
    return [
      (lon - bounds.minLon) * mPerDegLon,
      (lat - bounds.minLat) * mPerDegLat
    ];
  }

  function unproject(x, y) {
    const lon = x / mPerDegLon + bounds.minLon;
    const lat = y / mPerDegLat + bounds.minLat;
    return [lon, lat];
  }

  return { project, unproject };
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

function colorCoreLine(z, minZ, maxZ) {
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

function buildHeightmapIDW(samples, boundsXY, cols, rows, k = 6, power = 2) {
  const { minX, maxX, minY, maxY } = boundsXY;
  const heights = new Float32Array(cols * rows);

  const cellSize = Math.max(maxX - minX, maxY - minY) / 32;
  const grid = new Map();
  const key = (cx, cy) => cx + "," + cy;

  for (const s of samples) {
    const cx = Math.floor((s.x - minX) / cellSize);
    const cy = Math.floor((s.y - minY) / cellSize);
    const kk = key(cx, cy);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(s);
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
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);

      const candidates = nearby(x, y);
      const dists = [];
      for (const s of candidates) {
        const d = Math.hypot(s.x - x, s.y - y) + 1e-6;
        dists.push({ s, d });
      }
      dists.sort((a, b) => a.d - b.d);
      const nearest = dists.slice(0, Math.min(k, dists.length));

      let wSum = 0;
      let zSum = 0;
      for (const { s, d } of nearest) {
        const w = 1 / Math.pow(d, power);
        wSum += w;
        zSum += w * s.z;
      }
      const h = zSum / wSum;
      heights[j * cols + i] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }

  return { heights, cols, rows, minX, maxX, minY, maxY, hMin, hMax };
}

function sampleHeight(heightmap, x, y, zMin) {
  const { heights, cols, rows, minX, maxX, minY, maxY } = heightmap;
  const u = (x - minX) / Math.max(maxX - minX, 1e-6);
  const v = (y - minY) / Math.max(maxY - minY, 1e-6);
  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return 0; // mimo CORE – plochá nízka voda
  }
  const fx = u * (cols - 1);
  const fy = v * (rows - 1);
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, cols - 1);
  const j1 = Math.min(j0 + 1, rows - 1);
  const tx = fx - i0;
  const ty = fy - j0;
  const h00 = heights[j0 * cols + i0];
  const h10 = heights[j0 * cols + i1];
  const h01 = heights[j1 * cols + i0];
  const h11 = heights[j1 * cols + i1];
  const h =
    h00 * (1 - tx) * (1 - ty) +
    h10 * tx * (1 - ty) +
    h01 * (1 - tx) * ty +
    h11 * tx * ty;
  return h - zMin;
}

function showHeightmapPreview(heightmap) {
  let preview = document.getElementById("hmPreview");
  if (!preview) {
    preview = document.createElement("canvas");
    preview.id = "hmPreview";
    preview.style.cssText =
      "position:fixed;left:12px;bottom:12px;" +
      "border:1px solid #444;image-rendering:pixelated;z-index:20;background:#111;";
    document.body.appendChild(preview);
  }

  const { heights, cols, rows, hMin, hMax } = heightmap;
  const maxPx = 160;
  const aspect = cols / Math.max(rows, 1);
  let w, h;
  if (aspect >= 1) {
    w = maxPx;
    h = Math.max(40, Math.round(maxPx / aspect));
  } else {
    h = maxPx;
    w = Math.max(40, Math.round(maxPx * aspect));
  }
  preview.width = cols;
  preview.height = rows;
  preview.style.width = w + "px";
  preview.style.height = h + "px";

  const ctx = preview.getContext("2d");
  const img = ctx.createImageData(cols, rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const val = heights[j * cols + i];
      const t = hMax === hMin ? 0.5 : (val - hMin) / (hMax - hMin);
      const r = Math.floor(45 + t * 140);
      const g = Math.floor(110 - t * 40);
      const b = Math.floor(50 - t * 20);
      const idx = ((rows - 1 - j) * cols + i) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildTerrainMesh(heightmap, zMin, zMax) {
  const { heights, cols, rows, minX, maxX, minY, maxY } = heightmap;
  const width = maxX - minX;
  const depth = maxY - minY;

  const geom = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const i = iy * cols + ix;
      const h = heights[iy * cols + ix];
      pos.setY(i, h - zMin);
      const c = colorByElevation(h, zMin, zMax);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set((minX + maxX) / 2, 0, (minY + maxY) / 2);
  mesh.name = "coreTerrain";
  return mesh;
}

/** Rieka / voda z GeoJSON */
function buildRiverLayer(features, project, heightmap, zMin) {
  const group = new THREE.Group();
  let polys = 0;
  let lines = 0;
  const Y_OFFSET = 1.5; // mierne nad terénom, aby nepreblikávalo

  function addWaterPolygon(ring) {
    if (!ring || ring.length < 3) return;
    const shape = new THREE.Shape();
    const [x0, y0] = project(ring[0][0], ring[0][1]);
    shape.moveTo(x0, -y0);
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      shape.lineTo(x, -y);
    }
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);

    // výška = priemer výšok ringov na teréne
    let sum = 0;
    let n = 0;
    for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 12))) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      sum += sampleHeight(heightmap, x, y, zMin);
      n++;
    }
    const baseY = (n ? sum / n : 0) + Y_OFFSET;

    const mat = new THREE.MeshBasicMaterial({
      color: COLOR_WATER,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = baseY;
    group.add(mesh);
    polys++;
  }

  function addWaterLine(coords) {
    if (!coords || coords.length < 2) return;
    const positions = new Float32Array(coords.length * 3);
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = project(coords[i][0], coords[i][1]);
      const hy = sampleHeight(heightmap, x, y, zMin) + Y_OFFSET;
      positions[i * 3] = x;
      positions[i * 3 + 1] = hy;
      positions[i * 3 + 2] = y;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: COLOR_WATER_LINE,
      linewidth: 2
    });
    group.add(new THREE.Line(geom, mat));
    lines++;
  }

  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === "Polygon") {
      addWaterPolygon(geom.coordinates[0]);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) addWaterPolygon(poly[0]);
    } else if (geom.type === "LineString") {
      addWaterLine(geom.coordinates);
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) addWaterLine(line);
    }
  }

  return { group, polys, lines };
}

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Nepodarilo sa nacitat " + url);
  return res.json();
}

let terrainMesh = null;
let zMinGlobal = 0;
let unprojectFn = null;
let statusBase = "";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function onPointerDown(event) {
  if (!terrainMesh) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(terrainMesh, false);
  if (!hits.length) {
    info.textContent = statusBase + " | klik mimo CORE";
    return;
  }

  const p = hits[0].point;
  const elev = p.y + zMinGlobal;

  let lonLat = "";
  if (unprojectFn) {
    const [lon, lat] = unprojectFn(p.x, p.z);
    lonLat = ` | lon ${lon.toFixed(5)}, lat ${lat.toFixed(5)}`;
  }

  info.textContent =
    `X ${p.x.toFixed(1)} m | Y ${elev.toFixed(1)} m n.m. | Z ${p.z.toFixed(1)} m` +
    lonLat;
}

canvas.addEventListener("pointerdown", onPointerDown);

window.__heightmap = null;

async function init() {
  try {
    info.textContent = "Nacitam data...";

    const [outerJson, midJson, coreJson, riverJson] = await Promise.all([
      loadGeoJSON("data/contours_outer.geojson"),
      loadGeoJSON("data/contours_bg.geojson"),
      loadGeoJSON("data/contours.geojson"),
      loadGeoJSON("data/river.geojson")
    ]);

    const outerFeatures = outerJson.features || [];
    const midFeatures = midJson.features || [];
    const coreFeatures = coreJson.features || [];
    const riverFeatures = riverJson.features || [];

    const outerBounds = collectBounds(outerFeatures);
    const coreBounds = collectBounds(coreFeatures);

    const proj = makeProjector(outerBounds);
    const project = proj.project;
    unprojectFn = proj.unproject;

    zMinGlobal = coreBounds.minZ;
    const zMin = coreBounds.minZ;
    const zMax = coreBounds.maxZ;

    const outer = buildLineLayer(outerFeatures, project, zMin, zMax, colorOuter, 0.22);
    scene.add(outer.group);

    const mid = buildLineLayer(midFeatures, project, zMin, zMax, colorMid, 0.4);
    scene.add(mid.group);

    const coreLines = buildLineLayer(coreFeatures, project, zMin, zMax, colorCoreLine, 0.45);
    scene.add(coreLines.group);

    info.textContent = "Heightmap + mesh...";
    const samples = collectSamples(coreFeatures, project, 3);

    const [x0, y0] = project(coreBounds.minLon, coreBounds.minLat);
    const [x1, y1] = project(coreBounds.maxLon, coreBounds.maxLat);
    const boundsXY = {
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1),
      maxY: Math.max(y0, y1)
    };

    const widthM = boundsXY.maxX - boundsXY.minX;
    const heightM = boundsXY.maxY - boundsXY.minY;
    const aspect = widthM / Math.max(heightM, 1e-6);

    const LONG = 128;
    let cols, rows;
    if (aspect >= 1) {
      cols = LONG;
      rows = Math.max(8, Math.round(LONG / aspect));
    } else {
      rows = LONG;
      cols = Math.max(8, Math.round(LONG * aspect));
    }

    await new Promise((r) => setTimeout(r, 30));

    const heightmap = buildHeightmapIDW(samples, boundsXY, cols, rows, 6, 2);
    window.__heightmap = heightmap;
    showHeightmapPreview(heightmap);

    terrainMesh = buildTerrainMesh(heightmap, zMin, zMax);
    scene.add(terrainMesh);

    // --- RIEKA ---
    const river = buildRiverLayer(riverFeatures, project, heightmap, zMin);
    scene.add(river.group);

    const box = new THREE.Box3().setFromObject(terrainMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    controls.target.copy(center);
    camera.position.set(
      center.x + maxDim * 0.9,
      center.y + maxDim * 0.55,
      center.z + maxDim * 0.9
    );
    camera.near = maxDim / 3000;
    camera.far = maxDim * 150;
    camera.updateProjectionMatrix();
    controls.update();

    statusBase =
      "Mesh " + cols + "x" + rows +
      " | voda P" + river.polys + "/L" + river.lines +
      " | klikni na CORE";
    info.textContent = statusBase;
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
