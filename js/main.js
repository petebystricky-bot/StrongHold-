import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas3d");
const info = document.getElementById("info");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0d);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200000);
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

function isInside(inner, outer) {
  return (
    inner.minLon >= outer.minLon &&
    inner.maxLon <= outer.maxLon &&
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat
  );
}

function colorBg(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  // tlmené sivomodré pozadie
  const r = Math.floor(40 + t * 40);
  const g = Math.floor(50 + t * 50);
  const b = Math.floor(70 + t * 60);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

function colorCore(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  // výraznejšie jadro (zeleno–žlté)
  const r = Math.floor(40 + t * 180);
  const g = Math.floor(140 + t * 80);
  const b = Math.floor(80 - t * 40);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

function buildLayer(features, project, zMin, zMax, colorFn, opacity) {
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

    const z = elev - zMin; // relatívna výška v metroch
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

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Nepodarilo sa nacitat " + url);
  return res.json();
}

async function init() {
  try {
    info.textContent = "Nacitam mapy...";

    const [bgJson, coreJson] = await Promise.all([
      loadGeoJSON("data/contours_bg.geojson"),
      loadGeoJSON("data/contours.geojson")
    ]);

    const bgFeatures = bgJson.features || [];
    const coreFeatures = coreJson.features || [];

    const bgBounds = collectBounds(bgFeatures);
    const coreBounds = collectBounds(coreFeatures);
    const inside = isInside(coreBounds, bgBounds);

    // Spoločná projekcia podľa veľkej mapy
    const project = makeProjector(bgBounds);
    const zMin = Math.min(bgBounds.minZ, coreBounds.minZ);
    const zMax = Math.max(bgBounds.maxZ, coreBounds.maxZ);

    // Pozadie (slabšie)
    const bg = buildLayer(bgFeatures, project, zMin, zMax, colorBg, 0.35);
    scene.add(bg.group);

    // Jadro (silnejšie)
    const core = buildLayer(coreFeatures, project, zMin, zMax, colorCore, 1.0);
    scene.add(core.group);

    // Kamera na jadro
    const box = new THREE.Box3().setFromObject(core.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    controls.target.copy(center);
    camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.55, center.z + maxDim * 0.9);
    camera.near = maxDim / 2000;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.update();

    info.textContent =
      "BG ciar: " + bg.count +
      " | Core ciar: " + core.count +
      " | Z " + Math.round(zMin) + "–" + Math.round(zMax) + " m" +
      " | Inside: " + (inside ? "ANO" : "NIE");
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
