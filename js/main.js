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

// Farby len pre CORE výplne
const COLOR_LOW = new THREE.Color("#2d6a3e");   // najnižšia – zelená
const COLOR_HIGH = new THREE.Color("#8b6914");  // najvyššia – hnedá

function colorByElevation(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  return COLOR_LOW.clone().lerp(COLOR_HIGH, t);
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

// CORE: čiary + výplne (opravené zrkadlenie)
function buildCoreLayer(features, project, zMin, zMax) {
  const group = new THREE.Group();
  let lines = 0;
  let fills = 0;

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
    const fillColor = colorByElevation(elev, zMin, zMax);
    const lineColor = colorCoreLine(elev, zMin, zMax);

    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 2) continue;

      // --- výplň ---
      if (ring.length >= 3) {
        const shape = new THREE.Shape();
        const [x0, y0] = project(ring[0][0], ring[0][1]);
        // -y kvôli rotateX(-PI/2), aby sedelo so čiarami
        shape.moveTo(x0, -y0);
        for (let i = 1; i < ring.length; i++) {
          const [x, y] = project(ring[i][0], ring[i][1]);
          shape.lineTo(x, -y);
        }
        const shapeGeom = new THREE.ShapeGeometry(shape);
        shapeGeom.rotateX(-Math.PI / 2);
        const fillMat = new THREE.MeshBasicMaterial({
          color: fillColor,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(shapeGeom, fillMat);
        mesh.position.y = z;
        group.add(mesh);
        fills++;
      }

      // --- čiara ---
      const positions = new Float32Array(ring.length * 3);
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        positions[i * 3] = x;
        positions[i * 3 + 1] = z + 0.5;
        positions[i * 3 + 2] = y;
      }
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: lineColor });
      group.add(new THREE.Line(lineGeom, lineMat));
      lines++;
    }
  }
  return { group, lines, fills };
}

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Nepodarilo sa nacitat " + url);
  return res.json();
}

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
    const midBounds = collectBounds(midFeatures);
    const coreBounds = collectBounds(coreFeatures);

    const project = makeProjector(outerBounds);

    // výšky len z CORE (výplne sú len tam)
    const zMin = coreBounds.minZ;
    const zMax = coreBounds.maxZ;

    // Outer + Mid: len čiary
    const outer = buildLineLayer(outerFeatures, project, zMin, zMax, colorOuter, 0.22);
    scene.add(outer.group);

    const mid = buildLineLayer(midFeatures, project, zMin, zMax, colorMid, 0.45);
    scene.add(mid.group);

    // Core: čiary + výplne
    const core = buildCoreLayer(coreFeatures, project, zMin, zMax);
    scene.add(core.group);

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
      "Outer: " + outer.count +
      " | Mid: " + mid.count +
      " | Core lines: " + core.lines +
      " fills: " + core.fills +
      " | Z " + Math.round(zMin) + "–" + Math.round(zMax) + " m";
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
