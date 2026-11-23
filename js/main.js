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

const MAX_SLOPE = 0.0005;   // 0.5 m / km
const LINE_HALF_WIDTH = 28;
const TARGET_DEPTH = 4;     // max skok breJasné. **Hladinu nedvíhame.**  
Terén (IDW) **len mimo vody**.  
Voda = **geo rieka** (vodováha + jemný spád).  
Koryto vznikne tým, že v mieste rieky **nie je terén z IDW**.

### Zmena v `buildHeightmapWithRiver` (nahradením celej funkcie)

```js
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

  // --- 1) najprv maska vody (ešte pred IDW) ---
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / Math.max(cols - 1, 1)) * (maxX - minX);
      const y = minY + (j / Math.max(rows - 1, 1)) * (maxY - minY);
      const [lon, lat] = unproject(x, y);
      if (waterIndex.isWater(lon, lat, x, y)) water[j * cols + i] = 1;
    }
  }

  // --- 2) IDW len mimo vody; vzorky vo vode ignoruj ---
  const landSamples = samples.filter((s) => {
    const [lon, lat] = unproject(s.x, s.y);
    return !waterIndex.isWater(lon, lat, s.x, s.y);
  });
  const samplePool = landSamples.length >= 10 ? landSamples : samples;

  const cellSize = Math.max(maxX - minX, maxY - minY) / 32;
  const grid = new Map();
  const key = (cx, cy) => cx + "," + cy;

  for (const s of samplePool) {
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
    return out.length ? out : samplePool;
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (water[j * cols + i]) continue; // voda = neskôr z geo rieky

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

  // pomocná mriežka len z pevniny (na odhad výšky na osi koryta)
  const landHeights = new Float32Array(heights);

  // prázdne vodné bunky dočasne doplň z najbližšej pevniny (len na profil)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!water[j * cols + i]) continue;
      let bestH = null;
      let bestD = Infinity;
