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

// max spád hladiny: 0.5 m na 1 km (veľmi jemné)
const MAX_SLOPE = 0.0005;
const LINE_HALF_WIDTH = 28;

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

function buildWaterIndex(riverFeatures, project, coreBounds) {
  const polygons = [];
  const linesM = [];

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

  // hlavná os = najdlhšia línia v CORE (typicky Váh)
  let mainLine = null;
  let mainLen = -1;
  for (const line of linesM) {
    let len = 0;
    for (let i = 0; i < line.length - 1; i++) {
      len += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    }
    if (len > mainLen) {
      mainLen = len;
      mainLine = line;
    }
  }

  /** Profile pozdĺž hlavnej osi: body s kumulatívnou vzdialenosťou s */
  function buildStationPolyline() {
    if (!mainLine || mainLine.length < 2) return [];
    const stations = [];
    let s = 0;
    stations.push({ x: mainLine[0].x, y: mainLine[0].y, s: 0 });
    for (let i = 1; i < mainLine.length; i++) {
      s += Math.hypot(
        mainLine[i].x - mainLine[i - 1].x,
        mainLine[i].y - mainLine[i - 1].y
      );
      stations.push({ x: mainLine[i].x, y: mainLine[i].y, s });
    }
    return stations;
  }

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

  /** Najbližší bod na hlavnej osi + staničenie s */
  function nearestOnMain(x, y) {
    if (!mainLine || mainLine.length < 2) return null;
    let bestD = Infinity;
    let best = null;
    let sBase = 0;
    for (let i = 0; i < mainLine.length - 1; i++) {
      const ax = mainLine[i].x, ay = mainLine[i].y;
      const bx = mainLine[i + 1].x, by = mainLine[i + 1].y;
      const dx = bx - ax, dy = by - ay;
      const segLen = Math.hypot(dx, dy);
      const len2 = dx * dx + dy * dy;
      let t = len2 < 1e-12 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) {
        bestD = d;
        best = { x: px, y: py, s: sBase + t * segLen, d };
      }
      sBase += segLen;
    }
    return best;
  }

  return {
    isWater,
    nearestOnMain,
    buildStationPolyline,
    hasLines: !!mainLine,
    polyCount: polygons.length,
    lineCount: linesM.length
  };
}

function sampleGrid(heights, cols, rows, minX, maxX, minY, maxY, x, y) {
  const u = (x - minX) / Math.max(maxX - minX, 1e-6);
  const v = (y - minY) / Math.max(maxY - minY, 1e-6);
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const fx = u * (cols - 1);
  const fy = v * (rows - 1);
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, cols - 1);
  const j1 = Math.min(j0 + 1, rows - 1);
  const tx = fx - i0;
  const ty = fy - j0;
  return (
    heights[j0 * cols + i0] * (1 - tx) * (1 - ty) +
    heights[j0 * cols + i1] * tx * (1 - ty) +
    heights[j1 * cols + i0] * (1 - tx) * ty +
    heights[j1 * cols + i1] * tx * ty
  );
}

/**
 * Profil hladiny pozdĺž toku:
 * - vzorky IDW na osi
 * - vyhladenie
 * - monotónny jemný spád (neide do kopca po toku)
 */
function buildWaterProfile(stations, idwHeights, cols, rows, boundsXY) {
  const { minX, maxX, minY, maxY } = boundsXY;
  if (!stations.length) return null;

  const raw = stations.map((st) => {
    const h = sampleGrid(idwHeights, cols, rows, minX, maxX, minY, maxY, st.x, st.y);
    return { s: st.s, h: h == null ? 0 : h };
  });

  // kĺzavý priemer
  const win = 3;
  const smooth = raw.map((p, i) => {
    let sum = 0, n = 0;
    for (let k = i - win; k <= i + win; k++) {
      if (k < 0 || k >= raw.length) continue;
      sum += raw[k].h;
      n++;
    }
    return { s: p.s, h: sum / n };
  });

  // smer toku: nech hladina celkovo klesá (ak IDW rastie, otočíme staničenie)
  const first = smooth[0].h;
  const last = smooth[smooth.length - 1].h;
  if (last > first + 0.5) {
    const sMax = smooth[smooth.length - 1].s;
    smooth.reverse();
    for (const p of smooth) p.s = sMax - p.s;
    smooth.sort((a, b) => a.s - b.s);
  }

  // monotónny spád + limit MAX_SLOPE
  const profile = [{ s: smooth[0].s, h: smooth[0].h }];
  for (let i = 1; i < smooth.length; i++) {
    const ds = Math.max(smooth[i].s - profile[i - 1].s, 1e-3);
    const maxDrop = MAX_SLOPE * ds;
    // nesmie stúpať; klesanie max MAX_SLOPE
    let h = Math.min(smooth[i].h, profile[i - 1].h);
    h = Math.max(h, profile[i - 1].h - Math.max(maxDrop, 0.0001));
    // ak by chcela stúpať viac, pridrž predchádzajúcu (vodováha)
    if (smooth[i].h > profile[i - 1].h) h = profile[i - 1].h - maxDrop * 0.25;
    profile.push({ s: smooth[i].s, h });
  }

  function heightAtS(s) {
    if (s <= profile[0].s) return profile[0].h;
    if (s >= profile[profile.length - 1].s) return profile[profile.length - 1].h;
    for (let i = 0; i < profile.length - 1; i++) {
      if (s >= profile[i].s && s <= profile[i + 1].s) {
        const t = (s - profile[i].s) / Math.max(profile[i + 1].s - profile[i].s, 1e-6);
        return profile[i].h * (1 - t) + profile[i + 1].h * t;
      }
    }
    return profile[profile.length - 1].h;
  }

  return { heightAtS, profile };
}

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

  // 1) IDW terén
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
      let wSum = 0, zSum = 0;
      for (const { s, d } of nearest) {
        const w = 1 / Math.pow(d, power);
        wSum += w;
        zSum += w * s.z;
      }
      heights[j * cols + i] = zSum / wSum;
    }
  }

  const idwCopy = new Float32Array(heights);

  // 2) maska vody
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);
      const [lon, lat] = unproject(x, y);
      if (waterIndex.isWater(lon, lat, x, y)) water[j * cols + i] = 1;
    }
  }

  // 3) profil hladiny so slabým spádom
  const stations = waterIndex.buildStationPolyline();
  const waterProfile = buildWaterProfile(stations, idwCopy, cols, rows, boundsXY);

  // fallback: jedna plochá hladina = median
  let flatLevel = null;
  if (!waterProfile) {
    const vals = [];
    for (let n = 0; n < water.length; n++) if (water[n]) vals.push(idwCopy[n]);
    vals.sort((a, b) => a - b);
    flatLevel = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  }

  // 4) vodné bunky = hladina podľa staničenia na osi (priečne rovnaká)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!water[j * cols + i]) continue;
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);

      if (waterProfile) {
        const n = waterIndex.nearestOnMain(x, y);
        if (n) heights[j * cols + i] = waterProfile.heightAtS(n.s);
        else heights[j * cols + i] = waterProfile.heightAtS(0);
      } else {
        heights[j * cols + i] = flatLevel;
      }
    }
  }

  let waterCells = 0;
  let hMin = Infinity, hMax = -Infinity;
  for (let n = 0; n < heights.length; n++) {
    if (water[n]) waterCells++;
    if (heights[n] < hMin) hMin = heights[n];
    if (heights[n] > hMax) hMax = heights[n];
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
  let waterTxt = "";
  if (window.__heightmap) {
    const hm = window.__heightmap;
    const u = (p.x - hm.minX) / Math.max(hm.maxX - hm.minX, 1e-6);
    const v = (p.z - hm.minY) / Math.max(hm.maxY - hm.minY, 1e-6);
    const ix = Math.round(u * (hm.cols - 1));
    const iy = Math.round(v * (hm.rows - 1));
    if (ix >= 0 && iy >= 0 && ix < hm.cols && iy < hm.rows && hm.water[iy * hm.cols + ix]) {
      waterTxt = " | VODA";
    }
  }
  info.textContent =
    `X ${p.x.toFixed(1)} m | Y ${elev.toFixed(1)} m n.m. | Z ${p.z.toFixed(1)} m` +
    lonLat + waterTxt;
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

    scene.add(buildLineLayer(outerFeatures, project, zMin, zMax, colorOuter, 0.22).group);
    scene.add(buildLineLayer(midFeatures, project, zMin, zMax, colorMid, 0.4).group);
    scene.add(buildLineLayer(coreFeatures, project, zMin, zMax, colorCoreLine, 0.4).group);

    info.textContent = "Heightmap + vodna hladina so spadom...";
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
    await new Promise((r) => setTimeout(r, 30));

    const heightmap = buildHeightmapWithRiver(
      samples, boundsXY, cols, rows, waterIndex, unprojectFn, 6, 2
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
    camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.55, center.z + maxDim * 0.9);
    camera.near = maxDim / 3000;
    camera.far = maxDim * 150;
    camera.updateProjectionMatrix();
    controls.update();

    statusBase = "Mesh " + cols + "x" + rows + " | voda " + heightmap.waterCells + " | klikni CORE";
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
