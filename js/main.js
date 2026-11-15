import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas3d");
const overviewCanvas = document.getElementById("overviewCanvas");
const overviewCtx = overviewCanvas.getContext("2d");
const info = document.getElementById("info");
const coordsEl = document.getElementById("coords");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

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
// Hlavná kamera – BEZ limitu 30°
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.enablePan = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xfff5e0, 0.55);
sun.position.set(100, 200, 80);
scene.add(sun);

// ---------- Geo helpers ----------
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
  return {
    project(lon, lat) {
      return [
        (lon - bounds.minLon) * mPerDegLon,
        (lat - bounds.minLat) * mPerDegLat
      ];
    },
    unproject(x, y) {
      return [
        bounds.minLon + x / mPerDegLon,
        bounds.minLat + y / mPerDegLat
      ];
    }
  };
}

function surfaceColor(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  let r, g, b;
  if (t < 0.25) {
    r = 110 + t * 40; g = 140 + t * 30; b = 70;
  } else if (t < 0.55) {
    r = 40 + t * 30; g = 90 + t * 40; b = 45;
  } else if (t < 0.8) {
    r = 90 + t * 40; g = 100 + t * 20; b = 55;
  } else {
    r = 130 + t * 40; g = 125 + t * 30; b = 110;
  }
  return new THREE.Color(`rgb(\( {r | 0}, \){g | 0},${b | 0})`);
}

function lineColor(elev, minZ, maxZ, strength) {
  const c = surfaceColor(elev, minZ, maxZ);
  c.offsetHSL(0, 0, strength > 0.8 ? 0.1 : -0.1);
  return c;
}

async function loadGeoJSON(url) {
  const res = await fetch(url + "?" + Date.now());
  if (!res.ok) throw new Error("Chyba nacitania " + url);
  return res.json();
}

// ---------- 3D build ----------
let proj, zMin, zMax;
const clickables = [];

function addPolygonFill(ring, elev, project, z0, color, opacity) {
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
    depthWrite: opacity > 0.9
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = elev - z0;
  mesh.userData = { elev, type: "surface" };
  return mesh;
}

function addContourLine(ring, elev, project, z0, color, opacity) {
  if (!ring || ring.length < 2) return null;
  const positions = new Float32Array(ring.length * 3);
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    positions[i *
