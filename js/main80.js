import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas3d");
const info = document.getElementById("info");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100000
);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
scene.add(new THREE.AxesHelper(50));

// ---------- Geo utils ----------
function getBounds(features) {
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
    const polys = geom.type === "Polygon" ? [geom.coordinates]
                : geom.type === "MultiPolygon" ? geom.coordinates
                : null;
    if (!polys) continue;

    for (const poly of polys) {
      const ring = poly[0]; // vonkajší obrys
      if (!ring) continue;
      for (const pt of ring) {
        const lon = pt[0], lat = pt[1];
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
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
    const x = (lon - bounds.minLon) * mPerDegLon;
    const y = (lat - bounds.minLat) * mPerDegLat;
    return [x, y];
  };
}

function elevationColor(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  const r = Math.floor(30 + t * 180);
  const g = Math.floor(120 + t * 90);
  const b = Math.floor(170 - t * 130);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

// ---------- Build 3D lines from GeoJSON ----------
function buildContoursFromGeoJSON(geojson) {
  const features = geojson.features || [];
  const bounds = getBounds(features);
  const project = makeProjector(bounds);

  const group = new THREE.Group();
  const zScale = 1; // 1 unit = 1 meter výšky (môžeme neskôr zmeniť)

  let lineCount = 0;

  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;

    const geom = f.geometry;
    if (!geom) continue;

    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates :
      null;
    if (!polys) continue;

    const z = (elev - bounds.minZ) * zScale;
    const color = elevationColor(elev, bounds.minZ, bounds.maxZ);

    for (const poly of polys) {
      const ring = poly[0]; // len vonkajší ring
      if (!ring || ring.length < 2) continue;

      const positions = new Float32Array(ring.length * 3);
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        positions[i * 3] = x;
        positions[i * 3 + 1] = z; // výška
        positions[i * 3 + 2] = y;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(geometry, material);
      group.add(line);
      lineCount++;
    }
  }

  return { group, bounds, lineCount };
}

async function init() {
  try {
    info.textContent = "Nacitam contours.geojson (moze chvilu trvat)...";

    const res = await fetch("data/contours.geojson?" + Date.now());
    if (!res.ok) throw new Error("Nepodarilo sa nacitat data/contours.geojson");

    const geojson = await res.json();
    const { group, bounds, lineCount } = buildContoursFromGeoJSON(geojson);
    scene.add(group);

    // Kamera na stred
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    controls.target.copy(center);
    camera.position.set(
      center.x + maxDim * 0.8,
      center.y + maxDim * 0.5,
      center.z + maxDim * 0.8
    );
    camera.near = maxDim / 1000;
    camera.far = maxDim * 50;
    camera.updateProjectionMatrix();
    controls.update();

    info.textContent =
      "Vrstevnice: " + lineCount +
      " | Z: " + Math.round(bounds.minZ) + "–" + Math.round(bounds.maxZ) + " m" +
      " | Otoc / zoom mysou";
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
