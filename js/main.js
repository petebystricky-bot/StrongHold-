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
  10000
);
camera.position.set(80, 80, 80);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Slabé svetlo (pri čiarach skôr pre orientáciu)
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

// Osy – pomocné
scene.add(new THREE.AxesHelper(20));

function elevationColor(z, minZ, maxZ) {
  const t = maxZ === minZ ? 0.5 : (z - minZ) / (maxZ - minZ);
  // od modrozelenej po žltú
  const r = Math.floor(30 + t * 180);
  const g = Math.floor(120 + t * 80);
  const b = Math.floor(160 - t * 120);
  return new THREE.Color(`rgb(\( {r}, \){g},${b})`);
}

function buildContours(data) {
  const group = new THREE.Group();
  const minZ = data.bounds?.minZ ?? 0;
  const maxZ = data.bounds?.maxZ ?? 1;

  // Jemná horizontálna škála, aby mapa nebola obrovská/maličká
  const minX = data.bounds?.minX ?? 0;
  const maxX = data.bounds?.maxX ?? 1;
  const minY = data.bounds?.minY ?? 0;
  const maxY = data.bounds?.maxY ?? 1;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = 100 / span;
  const zScale = 0.15; // výška menej dramatická

  for (const contour of data.contours) {
    const pts = contour.points;
    if (!pts || pts.length < 2) continue;

    const z = (contour.elevation - minZ) * zScale;
    const positions = new Float32Array(pts.length * 3);

    for (let i = 0; i < pts.length; i++) {
      const x = (pts[i][0] - minX) * scale;
      const y = (pts[i][1] - minY) * scale;
      positions[i * 3] = x;
      positions[i * 3 + 1] = z;      // výška = Y v Three.js
      positions[i * 3 + 2] = y;      // mapa Y → Three Z
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: elevationColor(contour.elevation, minZ, maxZ)
    });

    const line = new THREE.Line(geometry, material);
    group.add(line);
  }

  return group;
}

async function init() {
  try {
    const res = await fetch("data/contours.json?" + Date.now());
    if (!res.ok) throw new Error("Nepodarilo sa nacitat data/contours.json");
    const data = await res.json();

    const group = buildContours(data);
    scene.add(group);

    // Vycentruj kameru na obsah
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    controls.target.copy(center);
    camera.position.set(
      center.x + maxDim * 0.9,
      center.y + maxDim * 0.7,
      center.z + maxDim * 0.9
    );
    controls.update();

    info.textContent =
      "Vrstevnice: " + data.contours.length +
      " | " + (data.bounds?.minZ ?? "?") + "–" + (data.bounds?.maxZ ?? "?") + " m" +
      " | Otoc / zoom mysou";
  } catch (err) {
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
