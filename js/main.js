import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas3d");
const info = document.getElementById("info");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a0b0);

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
controls.enablePan = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.4);
sun.position.set(80, 150, 60);
scene.add(sun);

// ---------- 2 farby ----------
const COLOR_LOW = new THREE.Color("#2d6a3e");   // najnižšia
const COLOR_HIGH = new THREE.Color("#c4b59a");  // najvyššia

function colorByElevation(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  return COLOR_LOW.clone().lerp(COLOR_HIGH, t);
}

function collectBounds(features) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
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
      for (const p of ring) {
        if (p[0] < minLon) minLon = p[0];
        if (p[0] > maxLon) maxLon = p[0];
        if (p[1] < minLat) minLat = p[1];
        if (p[1] > maxLat) maxLat = p[1];
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat, minZ, maxZ };
}

function makeProjector(bounds) {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((midLat * Math.PI) / 180);
  return function project(lon, lat) {
    return [
      (lon - bounds.minLon) * mPerDegLon,
      (lat - bounds.minLat) * mPerDegLat
    ];
  };
}

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Chyba nacitania " + url);
  return res.json();
}

function addFill(ring, elev, project, z0, color, opacity) {
  if (!ring || ring.length < 3) return null;
  const shape = new THREE.Shape();
  const [x0, y0] = project(ring[0][0], ring[0][1]);
  shape.moveTo(x0, y0);
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    shape.lineTo(x, y);
  }
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = elev - z0;
  return mesh;
}

function addLine(ring, elev, project, z0, color) {
  if (!ring || ring.length < 2) return null;
  const positions = new Float32Array(ring.length * 3);
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    positions[i * 3] = x;
    positions[i * 3 + 1] = elev - z0 + 0.3;
    positions[i * 3 + 2] = y;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
  return new THREE.Line(geom, mat);
}

function buildLayer(features, project, z0, zMin, zMax, fillOpacity) {
  const group = new THREE.Group();
  let fills = 0, lines = 0;
  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;
    const geom = f.geometry;
    if (!geom) continue;
    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;

    const col = colorByElevation(elev, zMin, zMax);
    for (const poly of polys) {
      const ring = poly[0];
      const mesh = addFill(ring, elev, project, z0, col, fillOpacity);
      if (mesh) { group.add(mesh); fills++; }
      const line = addLine(ring, elev, project, z0, col.clone().offsetHSL(0, 0, -0.25));
      if (line) { group.add(line); lines++; }
    }
  }
  return { group, fills, lines };
}

async function init() {
  try {
    info.textContent = "Nacitam vrstvy...";
    const [outerJson, midJson, coreJson] = await Promise.all([
      loadGeoJSON("data/contours_outer.geojson"),
      loadGeoJSON("data/contours_bg.geojson"),
      loadGeoJSON("data/contours.geojson")
    ]);

    const outerF = outerJson.features || [];
    const midF = midJson.features || [];
    const coreF = coreJson.features || [];

    const bOuter = collectBounds(outerF);
    const bMid = collectBounds(midF);
    const bCore = collectBounds(coreF);

    const zMin = Math.min(bOuter.minZ, bMid.minZ, bCore.minZ);
    const zMax = Math.max(bOuter.maxZ, bMid.maxZ, bCore.maxZ);

    const project = makeProjector(bOuter);

    // Outer slabšie, core najvýraznejšie
    const outer = buildLayer(outerF, project, zMin, zMin, zMax, 0.35);
    scene.add(outer.group);

    const mid = buildLayer(midF, project, zMin, zMin, zMax, 0.55);
    scene.add(mid.group);

    const core = buildLayer(coreF, project, zMin, zMin, zMax, 0.85);
    scene.add(core.group);

    const box = new THREE.Box3().setFromObject(core.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, 1);
    controls.target.copy(center);
    camera.position.set(center.x, center.y + maxDim * 0.9, center.z + maxDim * 0.35);
    camera.near = maxDim / 5000;
    camera.far = maxDim * 200;
    camera.updateProjectionMatrix();
    controls.update();

    info.textContent =
      `Z \( {Math.round(zMin)}– \){Math.round(zMax)} m | ` +
      `Outer ${outer.fills} | Mid ${mid.fills} | Core ${core.fills}`;
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
