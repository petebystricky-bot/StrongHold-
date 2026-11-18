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

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xfff5e0, 0.5);
sun.position.set(100, 200, 80);
scene.add(sun);

// ---------- helpers ----------
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

// farby inšpirované satelitom stredného SK
function surfaceColor(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  let r, g, b;
  if (t < 0.2) {
    // údolia / lúky
    r = 100 + t * 50; g = 130 + t * 40; b = 60;
  } else if (t < 0.45) {
    // polia / nízky les
    r = 70 + t * 40; g = 110 + t * 35; b = 50;
  } else if (t < 0.7) {
    // hustý les
    r = 35 + t * 25; g = 85 + t * 30; b = 40;
  } else if (t < 0.88) {
    // vyššie svahy
    r = 95 + t * 35; g = 100 + t * 20; b = 55;
  } else {
    // skala / hole
    r = 140 + t * 30; g = 135 + t * 25; b = 120;
  }
  return new THREE.Color(`rgb(\( {r | 0}, \){g | 0},${b | 0})`);
}

function lineColor(elev, minZ, maxZ) {
  const c = surfaceColor(elev, minZ, maxZ);
  c.offsetHSL(0, 0, -0.15);
  return c;
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
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity > 0.85
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = elev - z0;
  return mesh;
}

function addLine(ring, elev, project, z0, color, opacity) {
  if (!ring || ring.length < 2) return null;
  const positions = new Float32Array(ring.length * 3);
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    positions[i * 3] = x;
    positions[i * 3 + 1] = elev - z0;
    positions[i * 3 + 2] = y;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity
  });
  return new THREE.Line(geom, mat);
}

function buildLayer(features, project, z0, zMin, zMax, opts) {
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

    for (const poly of polys) {
      const ring = poly[0];
      if (opts.fill) {
        const mesh = addFill(
          ring, elev, project, z0,
          surfaceColor(elev, zMin, zMax),
          opts.fillOpacity
        );
        if (mesh) { group.add(mesh); fills++; }
      }
      if (opts.lines) {
        const line = addLine(
          ring, elev, project, z0,
          lineColor(elev, zMin, zMax),
          opts.lineOpacity
        );
        if (line) { group.add(line); lines++; }
      }
    }
  }
  return { group, fills, lines };
}

// ---------- init ----------
async function init() {
  try {
    info.textContent = "Nacitam 3 vrstvy + vyplne...";
    const [outerJson, midJson, coreJson] = await Promise.all([
      loadGeoJSON("data/contours_outer.geojson"),
      loadGeoJSON("data/contours_bg.geojson"),
      loadGeoJSON("data/contours.geojson")
    ]);

    const outerF = outerJson.features || [];
    const midF = midJson.features || [];
    const coreF = coreJson.features || [];

    const outerBounds = collectBounds(outerF);
    const midBounds = collectBounds(midF);
    const coreBounds = collectBounds(coreF);

    const zMin = Math.min(outerBounds.minZ, midBounds.minZ, coreBounds.minZ);
    const zMax = Math.max(outerBounds.maxZ, midBounds.maxZ, coreBounds.maxZ);

    // projekcia podľa outer (najväčšia mapa)
    const project = makeProjector(outerBounds);

    // Outer – slabá výplň
    const outer = buildLayer(outerF, project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.22,
      lines: true, lineOpacity: 0.3
    });
    scene.add(outer.group);

    // Mid – stredná výplň
    const mid = buildLayer(midF, project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.4,
      lines: true, lineOpacity: 0.5
    });
    scene.add(mid.group);

    // Core – silnejšia výplň
    const core = buildLayer(coreF, project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.75,
      lines: true, lineOpacity: 1.0
    });
    scene.add(core.group);

    // kamera na core
    const box = new THREE.Box3().setFromObject(core.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, 1);
    controls.target.copy(center);
    camera.position.set(center.x, center.y + maxDim * 0.85, center.z + maxDim * 0.4);
    camera.near = maxDim / 5000;
    camera.far = maxDim * 200;
    camera.updateProjectionMatrix();
    controls.update();

    info.textContent =
      `Outer F\( {outer.fills}/L \){outer.lines} | Mid F\( {mid.fills}/L \){mid.lines} | Core F\( {core.fills}/L \){core.lines} | Z \( {Math.round(zMin)}– \){Math.round(zMax)} m`;
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
