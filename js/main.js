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
const COLOR_WATER = new THREE.Color("#1a6a9a");

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
    return [x / mPerDegLon + bounds.minLon, y / mPerDegLat + bounds.minLat];
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

// ---------- voda: point-in-polygon + vzdialenosť k línii ----------

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Pripraví vodné polygóny (lon/lat) a línie v metroch */
function buildWaterIndex(riverFeatures, project, coreBounds) {
  const polygons = []; // rings in lon/lat
  const linesM = []; // arrays of {x,y} in meters

  const pad = 0.003;
  function nearCore(lon, lat) {
    return (
      lon >= coreBounds.minLon - pad &&
      lon <= coreBounds.maxLon + pad &&
      lat >= coreBounds.minLat - pad &&
      lat <= coreBounds.maxLat + pad
    );
  }

  for (const f of riverFeatures) {
    const g = f.geometry;
    if (!g) continue;

    if (g.type === "Polygon") {
      const ring = g.coordinates[0];
      if (ring && ring.some((c) => nearCore(c[0], c[1]))) polygons.push(ring);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) {
        const ring = poly[0];
        if (ring && ring.some((c) => nearCore(c[0], c[1]))) polygons.push(ring);
      }
    } else if (g.type === "LineString") {
      const pts = [];
      for (const c of g.coordinates) {
        if (!nearCore(c[0], c[1])) continue;
        const [x, y] = project(c[0], c[1]);
        pts.push({ x, y });
      }
      if (pts.length >= 2) linesM.push(pts);
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates) {
        const pts = [];
        for (const c of line) {
          if (!nearCore(c[0], c[1])) continue;
          const [x, y] = project(c[0], c[1]);
          pts.push({ x, y });
        }
        if (pts.length >= 2) linesM.push(pts);
      }
    }
  }

  // šírka koryta pre línie (metre) – Váh \~30–50 m, berieme polomer
  const LINE_HALF_WIDTH = 35;

  function isWater(lon, lat, x, y) {
    for (const ring of polygons) {
      if (pointInRing(lon, lat, ring)) return true;
    }
    for (const line of linesM) {
      for (let i = 0; i < line.length - 1; i++) {
        const d = distToSeg(x, y, line[i].x, line[i].y, line[i + 1].x, line[i + 1].y);
        if (d <= LINE_HALF_WIDTH) return true;
      }
    }
    return false;
  }

  return { isWater, polyCount: polygons.length, lineCount: linesM.length };
}

/**
 * Heightmap: IDW z vrstevníc, potom bunky vo vode
 * → dno koryta (nižšia výška) + flag water
 */
function buildHeightmapWithRiver(
  samples,
  boundsXY,
  cols,
  rows,
  waterIndex,
  unproject,
  k = 6,
  power = 2
) {
  const { minX, maxX, minY, maxY } = boundsXY;
  const heights = new Float32Array(cols * rows);
  const water = new Uint8Array(cols * rows);

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

  // 1) IDW všade
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);

      const candidates = nearby(x, y);
      const dists = candidates.map((s) => ({
        s,
        d: Math.hypot(s.x - x, s.y - y) + 1e-6
      }));
      dists.sort((a, b) => a.d - b.d);
      const nearest = dists.slice(0, Math.min(k, dists.length));

      let wSum = 0;
      let zSum = 0;
      for (const { s, d } of nearest) {
        const w = 1 / Math.pow(d, power);
        wSum += w;
        zSum += w * s.z;
      }
      heights[j * cols + i] = zSum / wSum;
    }
  }

  // 2) voda: označ + prehĺb koryto
  // dno = lokálne nižšie o CHANNEL_DEPTH, aspoň o niečo pod okolím
  const CHANNEL_DEPTH = 4; // metre
  let waterCells = 0;
  let hMin = Infinity;
  let hMax = -Infinity;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);
      const [lon, lat] = unproject(x, y);

      if (waterIndex.isWater(lon, lat, x, y)) {
        water[j * cols + i] = 1;
        heights[j * cols + i] -= CHANNEL_DEPTH;
        waterCells++;
      }

      const h = heights[j * cols + i];
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }

  return {
    heights,
    water,
    cols,
    rows,
    minX,
    maxX,
    minY,
    maxY,
    hMin,
    hMax,
    waterCells
  };
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

  const { heights, water, cols, rows, hMin, hMax } = heightmap;
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
      const idx = ((rows - 1 - j) * cols + i) * 4;
      if (water && water[j * cols + i]) {
        img.data[idx] = 30;
        img.data[idx + 1] = 100;
        img.data[idx + 2] = 160;
        img.data[idx + 3] = 255;
        continue;
      }
      const val = heights[j * cols + i];
      const t = hMax === hMin ? 0.5 : (val - hMin) / (hMax - hMin);
      img.data[idx] = Math.floor(45 + t * 140);
      img.data[idx + 1] = Math.floor(110 - t * 40);
      img.data[idx + 2] = Math.floor(50 - t * 20);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildTerrainMesh(heightmap, zMin, zMax) {
  const { heights, water, cols, rows, minX, maxX, minY, maxY } = heightmap;
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

      if (water && water[iy * cols + ix]) {
        colors[i * 3] = COLOR_WATER.r;
        colors[i * 3 + 1] = COLOR_WATER.g;
        colors[i * 3 + 2] = COLOR_WATER.b;
      } else {
        const c = colorByElevation(h, zMin, zMax);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
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

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Nepodarilo sa nacitat " + url);
  return res.json();
}

let terrainMesh = null;
let zMinGlobal = 0;
let unprojectFn = null;
let statusBase = "";
let waterMaskRef = null;

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

  // hrubá detekcia vody z masky
  let waterTxt = "";
  if (waterMaskRef && window.__heightmap) {
    const hm = window.__heightmap;
    const u = (p.x - hm.minX) / Math.max(hm.maxX - hm.minX, 1e-6);
    const v = (p.z - hm.minY) / Math.max(hm.maxY - hm.minY, 1e-6);
    const ix = Math.round(u * (hm.cols - 1));
    const iy = Math.round(v * (hm.rows - 1));
    if (ix >= 0 && iy >= 0 && ix < hm.cols && iy < hm.rows) {
      if (hm.water[iy * hm.cols + ix]) waterTxt = " | VODA";
    }
  }

  info.textContent =
    `X ${p.x.toFixed(1)} m | Y ${elev.toFixed(1)} m n.m. | Z ${p.z.toFixed(1)} m` +
    lonLat +
    waterTxt;
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

    const coreLines = buildLineLayer(coreFeatures, project, zMin, zMax, colorCoreLine, 0.4);
    scene.add(coreLines.group);

    info.textContent = "Heightmap s riekou...";
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

    const waterIndex = buildWaterIndex(riverFeatures, project, coreBounds);
    waterMaskRef = waterIndex;

    await new Promise((r) => setTimeout(r, 30));

    const heightmap = buildHeightmapWithRiver(
      samples,
      boundsXY,
      cols,
      rows,
      waterIndex,
      unprojectFn,
      6,
      2
    );
    window.__heightmap = heightmap;
    showHeightmapPreview(heightmap);

    terrainMesh = buildTerrainMesh(heightmap, zMin, zMax);
    scene.add(terrainMesh);

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
      " | voda buniek " + heightmap.waterCells +
      " | P" + waterIndex.polyCount + "/L" + waterIndex.lineCount +
      " | klikni CORE";
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
