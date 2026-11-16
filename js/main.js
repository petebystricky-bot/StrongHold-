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
scene.background = new THREE.Color(0x87a0b0); // jemné „nebo“

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minPolarAngle = 0; // zhora
controls.maxPolarAngle = Math.PI / 6; // max 30° od zvislice
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
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : null;
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
    },
    mPerDegLon,
    mPerDegLat
  };
}

// satelitná inšpirácia (stredné SK)
function surfaceColor(elev, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (elev - minZ) / (maxZ - minZ);
  let r, g, b;
  if (t < 0.25) { // údolia – lúky/polia
    r = 110 + t * 40; g = 140 + t * 30; b = 70;
  } else if (t < 0.55) { // les
    r = 40 + t * 30; g = 90 + t * 40; b = 45;
  } else if (t < 0.8) { // vyššie svahy
    r = 90 + t * 40; g = 100 + t * 20; b = 55;
  } else { // skala / hole
    r = 130 + t * 40; g = 125 + t * 30; b = 110;
  }
  return new THREE.Color(`rgb(\( {r|0}, \){g|0},${b|0})`);
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

// ---------- Build 3D ----------
let proj, worldBounds, zMin, zMax;
let coreGroup = null;
const clickables = []; // meshes for raycast

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
  // Shape je v XY → otočiť do XZ a posunúť na výšku
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
    positions[i * 3] = x;
    positions[i * 3 + 1] = elev - z0;
    positions[i * 3 + 2] = y;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geom, mat);
}

function buildLayer(features, project, z0, zMin, zMax, opts) {
  const group = new THREE.Group();
  let lines = 0, fills = 0;
  for (const f of features) {
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;
    const geom = f.geometry;
    if (!geom) continue;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;

    for (const poly of polys) {
      const ring = poly[0];
      if (opts.fill) {
        const mesh = addPolygonFill(
          ring, elev, project, z0,
          surfaceColor(elev, zMin, zMax),
          opts.fillOpacity
        );
        if (mesh) {
          group.add(mesh);
          if (opts.clickable) clickables.push(mesh);
          fills++;
        }
      }
      if (opts.lines) {
        const line = addContourLine(
          ring, elev, project, z0,
          lineColor(elev, zMin, zMax, opts.lineStrength || 0.5),
          opts.lineOpacity
        );
        if (line) { group.add(line); lines++; }
      }
    }
  }
  return { group, lines, fills };
}

function addFlatWorld(project, bounds, z0) {
  // doska = outer bounds, farba inšpirovaná SK satelitom (lúky / polia)
  const [x0, y0] = project(bounds.minLon, bounds.minLat);
  const [x1, y1] = project(bounds.maxLon, bounds.maxLat);
  const w = x1 - x0;
  const h = y1 - y0;
  const geom = new THREE.PlaneGeometry(w * 1.15, h * 1.15, 1, 1);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color("#6b8f5e"), // tlmená zelená krajina
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(geom, mat);
  plane.position.set((x0 + x1) / 2, -2, (y0 + y1) / 2); // tesne pod minZ
  plane.userData = { type: "flatworld", elev: z0 };
  scene.add(plane);
  clickables.push(plane);

  // jemný okraj
  const edges = new THREE.EdgesGeometry(geom);
  const edgeLine = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x3a4a35 })
  );
  edgeLine.position.copy(plane.position);
  scene.add(edgeLine);
}

// ---------- Minimap (2D hybrid) ----------
let minimapPaths = []; // {points:[[x,y],...], color}
let sceneSize = { minX: 0, maxX: 1, minY: 0, maxY: 1 };

function buildMinimapPaths(features, project, zMin, zMax, maxFeatures) {
  const paths = [];
  const step = Math.max(1, Math.floor(features.length / (maxFeatures || 40)));
  for (let fi = 0; fi < features.length; fi += step) {
    const f = features[fi];
    const elev = Number(f.properties?.elevation);
    if (Number.isNaN(elev)) continue;
    const geom = f.geometry;
    if (!geom) continue;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polys) continue;
    const c = surfaceColor(elev, zMin, zMax);
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 2) continue;
      // decimate points
      const pts = [];
      const stride = Math.max(1, Math.floor(ring.length / 80));
      for (let i = 0; i < ring.length; i += stride) {
        pts.push(project(ring[i][0], ring[i][1]));
      }
      paths.push({ points: pts, color: `rgb(\( {c.r*255|0}, \){c.g*255|0},${c.b*255|0})` });
    }
  }
  return paths;
}

function updateMinimapSize() {
  const value = Number(minimapSlider.value);
  const inverted = 100 - value;
  const size = Math.floor(90 + (Math.min(window.innerWidth, window.innerHeight) * 0.38 - 90) * (inverted / 100));
  overviewCanvas.width = size;
  overviewCanvas.height = size;
  if (value >= 98) minimapContainer.classList.add("hidden");
  else minimapContainer.classList.remove("hidden");
}

function drawMinimap() {
  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);
  overviewCtx.fillStyle = "#1a2318";
  overviewCtx.fillRect(0, 0, w, h);

  const minX = sceneSize.minX, maxX = sceneSize.maxX;
  const minY = sceneSize.minY, maxY = sceneSize.maxY;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = (Math.min(w, h) * 0.9) / span;
  const offX = (w - (maxX - minX) * scale) / 2;
  const offY = (h - (maxY - minY) * scale) / 2;

  function tx(x) { return offX + (x - minX) * scale; }
  function ty(y) { return h - (offY + (y - minY) * scale); }

  for (const path of minimapPaths) {
    if (path.points.length < 2) continue;
    overviewCtx.beginPath();
    overviewCtx.strokeStyle = path.color;
    overviewCtx.globalAlpha = 0.7;
    overviewCtx.lineWidth = 1;
    overviewCtx.moveTo(tx(path.points[0][0]), ty(path.points[0][1]));
    for (let i = 1; i < path.points.length; i++) {
      overviewCtx.lineTo(tx(path.points[i][0]), ty(path.points[i][1]));
    }
    overviewCtx.stroke();
  }
  overviewCtx.globalAlpha = 1;

  // zelený rámček – stred kamery na XZ
  const cx = controls.target.x;
  const cz = controls.target.z;
  const viewSpan = span * 0.18;
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    tx(cx - viewSpan / 2),
    ty(cz + viewSpan / 2),
    viewSpan * scale,
    viewSpan * scale
  );
}

// minimap drag / click
let miniDrag = false, miniLastX = 0, miniLastY = 0, miniDownX = 0, miniDownY = 0;

function minimapToWorld(mx, my) {
  const w = overviewCanvas.width, h = overviewCanvas.height;
  const minX = sceneSize.minX, maxX = sceneSize.maxX;
  const minY = sceneSize.minY, maxY = sceneSize.maxY;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = (Math.min(w, h) * 0.9) / span;
  const offX = (w - (maxX - minX) * scale) / 2;
  const offY = (h - (maxY - minY) * scale) / 2;
  const x = (mx - offX) / scale + minX;
  const y = (h - my - offY) / scale + minY;
  return [x, y];
}

function centerCameraOn(x, z) {
  const dy = camera.position.y - controls.target.y;
  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  controls.target.set(x, controls.target.y, z);
  camera.position.set(x + dx, controls.target.y + dy, z + dz);
  controls.update();
}

overviewCanvas.addEventListener("mousedown", e => {
  miniDrag = true;
  miniLastX = e.clientX; miniLastY = e.clientY;
  miniDownX = e.clientX; miniDownY = e.clientY;
});
window.addEventListener("mousemove", e => {
  if (!miniDrag) return;
  const rect = overviewCanvas.getBoundingClientRect();
  // prevod delta screen → world približne
  const w = overviewCanvas.width;
  const span = Math.max(sceneSize.maxX - sceneSize.minX, sceneSize.maxY - sceneSize.minY, 1);
  const scale = (Math.min(w, overviewCanvas.height) * 0.9) / span;
  const dx = (e.clientX - miniLastX) / scale;
  const dy = (e.clientY - miniLastY) / scale;
  controls.target.x -= dx;
  controls.target.z += dy;
  camera.position.x -= dx;
  camera.position.z += dy;
  miniLastX = e.clientX; miniLastY = e.clientY;
  controls.update();
});
window.addEventListener("mouseup", e => {
  if (!miniDrag) return;
  miniDrag = false;
  if (Math.hypot(e.clientX - miniDownX, e.clientY - miniDownY) < 5) {
    const rect = overviewCanvas.getBoundingClientRect();
    const [x, y] = minimapToWorld(e.clientX - rect.left, e.clientY - rect.top);
    centerCameraOn(x, y);
  }
});

minimapSlider.addEventListener("input", () => {
  updateMinimapSize();
  drawMinimap();
});

// ---------- Click → súradnice ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (!hits.length) {
    coordsEl.style.display = "none";
    return;
  }
  const p = hits[0].point;
  const elev = (hits[0].object.userData.elev != null)
    ? hits[0].object.userData.elev
    : (zMin + p.y);
  const [lon, lat] = proj.unproject(p.x, p.z);
  coordsEl.style.display = "block";
  coordsEl.textContent =
    `X: ${p.x.toFixed(1)}  Y: ${p.y.toFixed(1)}  Z: ${p.z.toFixed(1)}   |   ` +
    `lon: ${lon.toFixed(5)}  lat: ${lat.toFixed(5)}  |  výška ≈ ${elev.toFixed(0)} m`;
});

// ---------- Init ----------
async function init() {
  try {
    info.textContent = "Nacitam 3 vrstvy...";
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

    worldBounds = outerBounds;
    const projector = makeProjector(outerBounds);
    proj = projector;

    zMin = Math.min(outerBounds.minZ, midBounds.minZ, coreBounds.minZ);
    zMax = Math.max(outerBounds.maxZ, midBounds.maxZ, coreBounds.maxZ);

    addFlatWorld(projector.project, outerBounds, zMin);

    const outer = buildLayer(outerF, projector.project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.25, lines: true, lineOpacity: 0.25, lineStrength: 0.3
    });
    scene.add(outer.group);

    const mid = buildLayer(midF, projector.project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.35, lines: true, lineOpacity: 0.45, lineStrength: 0.5
    });
    scene.add(mid.group);

    const core = buildLayer(coreF, projector.project, zMin, zMin, zMax, {
      fill: true, fillOpacity: 0.7, lines: true, lineOpacity: 1.0, lineStrength: 1, clickable: true
    });
    scene.add(core.group);
    coreGroup = core.group;

    // scene size for minimap
    const [x0, y0] = projector.project(outerBounds.minLon, outerBounds.minLat);
    const [x1, y1] = projector.project(outerBounds.maxLon, outerBounds.maxLat);
    sceneSize = { minX: x0, maxX: x1, minY: y0, maxY: y1 };

    minimapPaths = [
      ...buildMinimapPaths(midF, projector.project, zMin, zMax, 30),
      ...buildMinimapPaths(coreF, projector.project, zMin, zMax, 40)
    ];

    // kamera na jadro
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

    updateMinimapSize();
    drawMinimap();

    info.textContent =
      `Outer ${outer.lines} | Mid ${mid.lines} | Core ${core.lines} | Z \( {Math.round(zMin)}– \){Math.round(zMax)} m | max náklon 30°`;
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
  drawMinimap();
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateMinimapSize();
});

minimapSlider.value = 72;
init();
animate();
