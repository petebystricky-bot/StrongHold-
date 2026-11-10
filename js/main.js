// ======================
// Pomocné funkcie
// ======================
function showError(msg) {
  console.error(msg);
  const info = document.getElementById("info");
  if (info) {
    info.textContent = "CHYBA: " + msg;
    info.style.color = "#f87171";
  }
  // Aby nebola úplne čierna obrazovka
  const canvas = document.getElementById("detailCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 50;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f87171";
    ctx.font = "16px Arial";
    ctx.fillText(msg, 20, 40);
  }
}

function heightToColor(height, shade = 1) {
  const t = Math.max(0, Math.min(1, height / 1500));
  let r, g, b;

  if (t < 0.2) {
    const k = t / 0.2;
    r = 25 + k * 35; g = 70 + k * 60; b = 130 + k * 40;
  } else if (t < 0.45) {
    const k = (t - 0.2) / 0.25;
    r = 60 + k * 50; g = 140 + k * 30; b = 70 - k * 20;
  } else if (t < 0.7) {
    const k = (t - 0.45) / 0.25;
    r = 130 + k * 40; g = 110 - k * 25; b = 65 - k * 15;
  } else {
    const k = (t - 0.7) / 0.3;
    r = 170 + k * 85; g = 165 + k * 90; b = 160 + k * 95;
  }

  r = Math.min(255, Math.max(0, r * shade));
  g = Math.min(255, Math.max(0, g * shade));
  b = Math.min(255, Math.max(0, b * shade));
  return `rgb(\( {r|0}, \){g|0},${b|0})`;
}

// ======================
// Premenné
// ======================
let heightData = null;
let mesh = null;

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas ? detailCanvas.getContext("2d") : null;
const overviewCtx = overviewCanvas ? overviewCanvas.getContext("2d") : null;
const infoDiv = document.getElementById("info");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

const RENDER_SCALE = 4;

let viewWidth = 40;
let viewHeight = 50;
let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0, lastY = 0;
let dragTarget = null;
let dragStartX = 0, dragStartY = 0;

// ======================
// Načítanie heightmapy
// ======================
function loadHeightmap() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;

        const heights = [];
        for (let y = 0; y < img.height; y++) {
          const row = [];
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            row.push((data[i] / 255) * 1500);
          }
          heights.push(row);
        }
        resolve(heights);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => reject(new Error("Nepodarilo sa načítať data/heightmap.png"));
    img.src = "data/heightmap.png?" + Date.now(); // proti cache
  });
}

// ======================
// Mesh
// ======================
function buildMesh(heights) {
  const w = heights[0].length;
  const h = heights.length;
  const positions = new Float32Array(w * h * 3);
  const normals = new Float32Array(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = heights[y][x];
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const hL = heights[y][Math.max(0, x - 1)];
      const hR = heights[y][Math.min(w - 1, x + 1)];
      const hD = heights[Math.max(0, y - 1)][x];
      const hU = heights[Math.min(h - 1, y + 1)][x];

      let nx = hL - hR;
      let ny = hD - hU;
      let nz = 2.5;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return { positions, normals, width: w, height: h };
}

function sampleHeight(x, y) {
  const w = mesh.width, h = mesh.height;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;

  const h00 = mesh.positions[(y0 * w + x0) * 3 + 2];
  const h10 = mesh.positions[(y0 * w + x1) * 3 + 2];
  const h01 = mesh.positions[(y1 * w + x0) * 3 + 2];
  const h11 = mesh.positions[(y1 * w + x1) * 3 + 2];

  return (h00*(1-fx) + h10*fx)*(1-fy) + (h01*(1-fx) + h11*fx)*fy;
}

function sampleNormal(x, y) {
  const w = mesh.width, h = mesh.height;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;

  function n(ix, iy) {
    const i = (iy * w + ix) * 3;
    return [mesh.normals[i], mesh.normals[i+1], mesh.normals[i+2]];
  }
  const n00 = n(x0,y0), n10 = n(x1,y0), n01 = n(x0,y1), n11 = n(x1,y1);
  const out = [0,0,0];
  for (let k = 0; k < 3; k++) {
    const a = n00[k]*(1-fx) + n10[k]*fx;
    const b = n01[k]*(1-fx) + n11[k]*fx;
    out[k] = a*(1-fy) + b*fy;
  }
  return out;
}

function getShade(normal) {
  const dot = normal[0]*(-0.4) + normal[1]*(-0.5) + normal[2]*0.8;
  return 0.55 + Math.max(0, dot) * 0.6;
}

// ======================
// Pohľad a veľkosti
// ======================
function calculateViewSize() {
  if (!mesh) return;
  const w = detailCanvas.width, h = detailCanvas.height;
  const aspect = w / h;
  let cols = 40, rows = 50;
  if (aspect >= 1) {
    rows = 40;
    cols = Math.max(40, Math.round(rows * aspect));
  } else {
    cols = 40;
    rows = Math.max(40, Math.round(cols / aspect));
  }
  viewWidth = Math.min(cols, mesh.width * RENDER_SCALE);
  viewHeight = Math.min(rows, mesh.height * RENDER_SCALE);
}

function updateMinimapSize() {
  if (!minimapSlider || !overviewCanvas) return;
  const value = Number(minimapSlider.value);
  const inverted = 100 - value;
  const size = Math.floor(50 + (window.innerWidth * 0.48 - 50) * (inverted / 100));
  overviewCanvas.width = size;
  overviewCanvas.height = size;
  if (minimapContainer) {
    if (value >= 98) minimapContainer.classList.add("hidden");
    else minimapContainer.classList.remove("hidden");
  }
}

function updateCanvasSizes() {
  if (!detailCanvas) return;
  const bar = document.getElementById("bottom-bar");
  const barHeight = bar ? bar.offsetHeight : 48;
  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;
  if (minimapContainer) minimapContainer.style.bottom = (barHeight + 6) + "px";
  if (mesh) {
    calculateViewSize();
    updateMinimapSize();
    clampView();
  }
}

function clampView() {
  if (!mesh) return;
  viewX = Math.max(0, Math.min(mesh.width * RENDER_SCALE - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mesh.height * RENDER_SCALE - viewHeight, viewY));
}

// ======================
// Vykreslenie
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!mesh || !detailCtx) return;
  const w = detailCanvas.width, h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);

  const tileW = w / viewWidth;
  const tileH = h / viewHeight;
  const startX = Math.floor(viewX);
  const startY = Math.floor(viewY);
  const offX = (viewX - startX) * tileW;
  const offY = (viewY - startY) * tileH;

  for (let y = 0; y <= viewHeight; y++) {
    for (let x = 0; x <= viewWidth; x++) {
      const mx = (startX + x) / RENDER_SCALE;
      const my = (startY + y) / RENDER_SCALE;
      const sx = x * tileW - offX;
      const sy = y * tileH - offY;

      if (mx < 0 || mx >= mesh.width - 0.01 || my < 0 || my >= mesh.height - 0.01) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);
        continue;
      }
      const height = sampleHeight(mx, my);
      const shade = getShade(sampleNormal(mx, my));
      detailCtx.fillStyle = heightToColor(height, shade);
      detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);
    }
  }
}

function drawOverview() {
  if (!mesh || !overviewCtx) return;
  const w = overviewCanvas.width, h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);
  const scaleX = w / mesh.width;
  const scaleY = h / mesh.height;

  for (let y = 0; y < mesh.height; y++) {
    for (let x = 0; x < mesh.width; x++) {
      const i = (y * mesh.width + x) * 3;
      const height = mesh.positions[i + 2];
      const normal = [mesh.normals[i], mesh.normals[i+1], mesh.normals[i+2]];
      overviewCtx.fillStyle = heightToColor(height, getShade(normal));
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    (viewX / RENDER_SCALE) * scaleX,
    (viewY / RENDER_SCALE) * scaleY,
    (viewWidth / RENDER_SCALE) * scaleX,
    (viewHeight / RENDER_SCALE) * scaleY
  );
}

// ======================
// Ovládanie
// ======================
function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx; lastY = cy;
  dragStartX = cx; dragStartY = cy;
  dragTarget = target;
}
function moveDrag(cx, cy) {
  if (!isDragging || !mesh) return;
  const dx = cx - lastX, dy = cy - lastY;
  if (dragTarget === "detail") {
    viewX -= dx / (detailCanvas.width / viewWidth);
    viewY -= dy / (detailCanvas.height / viewHeight);
  } else {
    const sx = overviewCanvas.width / mesh.width;
    const sy = overviewCanvas.height / mesh.height;
    viewX -= (dx / sx) * RENDER_SCALE;
    viewY -= (dy / sy) * RENDER_SCALE;
  }
  clampView();
  lastX = cx; lastY = cy;
  drawAll();
}
function endDrag(cx, cy) {
  if (dragTarget === "overview" && cx != null && Math.hypot(cx - dragStartX, cy - dragStartY) < 6) {
    handleMinimapClick(cx, cy);
  }
  isDragging = false;
  dragTarget = null;
}
function handleMinimapClick(cx, cy) {
  if (!mesh) return;
  const rect = overviewCanvas.getBoundingClientRect();
  const mx = cx - rect.left, my = cy - rect.top;
  const sx = overviewCanvas.width / mesh.width;
  const sy = overviewCanvas.height / mesh.height;
  viewX = (mx / sx) * RENDER_SCALE - viewWidth / 2;
  viewY = (my / sy) * RENDER_SCALE - viewHeight / 2;
  clampView();
  drawAll();
}

// Udalosti
if (detailCanvas) {
  detailCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "detail"); });
  detailCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
  detailCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
  detailCanvas.addEventListener("mouseleave", () => endDrag());
  detailCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail"); }, {passive:false});
  detailCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  detailCanvas.addEventListener("touchend", e => endDrag(e.changedTouches[0]?.clientX, e.changedTouches[0]?.clientY));
}
if (overviewCanvas) {
  overviewCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "overview"); });
  overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
  overviewCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
  overviewCanvas.addEventListener("mouseleave", () => endDrag());
  overviewCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview"); }, {passive:false});
  overviewCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  overviewCanvas.addEventListener("touchend", e => endDrag(e.changedTouches[0]?.clientX, e.changedTouches[0]?.clientY));
}
if (minimapSlider) minimapSlider.addEventListener("input", () => { updateMinimapSize(); drawAll(); });
window.addEventListener("resize", () => { updateCanvasSizes(); drawAll(); });

// ======================
// Štart
// ======================
async function init() {
  try {
    if (!detailCanvas) throw new Error("Chýba element #detailCanvas");
    heightData = await loadHeightmap();
    mesh = buildMesh(heightData);

    if (infoDiv) {
      infoDiv.textContent = `Mesh \( {mesh.width}× \){mesh.height} | Heightmapa načítaná`;
      infoDiv.style.color = "#bbb";
    }

    if (minimapSlider) minimapSlider.value = 72;
    updateCanvasSizes();
    viewX = (mesh.width * RENDER_SCALE - viewWidth) / 2;
    viewY = (mesh.height * RENDER_SCALE - viewHeight) / 2;
    clampView();
    drawAll();
  } catch (err) {
    showError(err.message || String(err));
  }
}

init();
