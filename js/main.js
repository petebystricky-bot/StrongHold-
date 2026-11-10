// ======================
// Farby podľa výšky
// ======================
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

  // Aplikujeme tieň (shade 0.55–1.15)
  r = Math.min(255, Math.max(0, r * shade));
  g = Math.min(255, Math.max(0, g * shade));
  b = Math.min(255, Math.max(0, b * shade));

  return `rgb(\( {r|0}, \){g|0},${b|0})`;
}

// ======================
// Premenné
// ======================
let heightData = null;
let srcWidth = 36;
let srcHeight = 64;

let mesh = null; // { positions, normals, width, height }

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas.getContext("2d");
const overviewCtx = overviewCanvas.getContext("2d");
const infoDiv = document.getElementById("info");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

// Jemnosť vykresľovania (vyššie = menej kockované, ale pomalšie)
const RENDER_SCALE = 5;

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
      srcWidth = img.width;
      srcHeight = img.height;
      resolve(heights);
    };
    img.onerror = () => reject(new Error("heightmap.png sa nenačítala"));
    img.src = "data/heightmap.png";
  });
}

// ======================
// Vytvorenie mesh z heightmapy
// ======================
function buildMesh(heights) {
  const w = heights[0].length;
  const h = heights.length;

  // Pozície: [x, y, z] pre každý bod
  const positions = new Float32Array(w * h * 3);
  // Normály: [nx, ny, nz]
  const normals = new Float32Array(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      positions[i]     = x;
      positions[i + 1] = y;
      positions[i + 2] = heights[y][x];
    }
  }

  // Výpočet normál (centrálna diferencia)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;

      const hL = heights[y][Math.max(0, x - 1)];
      const hR = heights[y][Math.min(w - 1, x + 1)];
      const hD = heights[Math.max(0, y - 1)][x];
      const hU = heights[Math.min(h - 1, y + 1)][x];

      // Vektor sklonu
      let nx = hL - hR;
      let ny = hD - hU;
      let nz = 2.0; // sila "plošnosti"

      // Normalizácia
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals[i]     = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }

  return { positions, normals, width: w, height: h };
}

// ======================
// Bilineárna vzorka z mesh
// ======================
function sampleHeight(x, y) {
  const w = mesh.width;
  const h = mesh.height;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;

  const i00 = (y0 * w + x0) * 3 + 2;
  const i10 = (y0 * w + x1) * 3 + 2;
  const i01 = (y1 * w + x0) * 3 + 2;
  const i11 = (y1 * w + x1) * 3 + 2;

  const h00 = mesh.positions[i00];
  const h10 = mesh.positions[i10];
  const h01 = mesh.positions[i01];
  const h11 = mesh.positions[i11];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fy) + h1 * fy;
}

function sampleNormal(x, y) {
  const w = mesh.width;
  const h = mesh.height;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0;
  const fy = y - y0;

  function getN(ix, iy) {
    const i = (iy * w + ix) * 3;
    return [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]];
  }

  const n00 = getN(x0, y0);
  const n10 = getN(x1, y0);
  const n01 = getN(x0, y1);
  const n11 = getN(x1, y1);

  const n = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a = n00[k] * (1 - fx) + n10[k] * fx;
    const b = n01[k] * (1 - fx) + n11[k] * fx;
    n[k] = a * (1 - fy) + b * fy;
  }
  return n;
}

// Jednoduché osvetlenie podľa normály
function getShade(normal) {
  // Svetlo prichádza zhora-zľava
  const lx = -0.4, ly = -0.5, lz = 0.8;
  const dot = normal[0] * lx + normal[1] * ly + normal[2] * lz;
  return 0.55 + Math.max(0, dot) * 0.6;
}

// ======================
// Canvas a pohľad
// ======================
function calculateViewSize() {
  const w = detailCanvas.width;
  const h = detailCanvas.height;
  const aspect = w / h;

  let cols = 40;
  let rows = 50;

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
  const value = Number(minimapSlider.value);
  const inverted = 100 - value;
  const minSize = 50;
  const maxSize = Math.floor(window.innerWidth * 0.48);
  const size = Math.floor(minSize + (maxSize - minSize) * (inverted / 100));

  overviewCanvas.width = size;
  overviewCanvas.height = size;

  if (value >= 98) minimapContainer.classList.add("hidden");
  else minimapContainer.classList.remove("hidden");
}

function updateCanvasSizes() {
  const bar = document.getElementById("bottom-bar");
  const barHeight = bar ? bar.offsetHeight : 48;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + 6) + "px";
  }

  if (mesh) {
    calculateViewSize();
    updateMinimapSize();
    clampView();
  }
}

function clampView() {
  const maxX = mesh.width * RENDER_SCALE - viewWidth;
  const maxY = mesh.height * RENDER_SCALE - viewHeight;
  viewX = Math.max(0, Math.min(maxX, viewX));
  viewY = Math.max(0, Math.min(maxY, viewY));
}

// ======================
// Vykreslenie
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!mesh) return;

  const w = detailCanvas.width;
  const h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);

  const tileW = w / viewWidth;
  const tileH = h / viewHeight;

  const startX = Math.floor(viewX);
  const startY = Math.floor(viewY);
  const offsetX = (viewX - startX) * tileW;
  const offsetY = (viewY - startY) * tileH;

  for (let y = 0; y <= viewHeight; y++) {
    for (let x = 0; x <= viewWidth; x++) {
      const mx = (startX + x) / RENDER_SCALE;
      const my = (startY + y) / RENDER_SCALE;

      if (mx < 0 || mx >= mesh.width - 0.01 || my < 0 || my >= mesh.height - 0.01) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(x * tileW - offsetX, y * tileH - offsetY, tileW + 1, tileH + 1);
        continue;
      }

      const height = sampleHeight(mx, my);
      const normal = sampleNormal(mx, my);
      const shade = getShade(normal);

      detailCtx.fillStyle = heightToColor(height, shade);
      detailCtx.fillRect(x * tileW - offsetX, y * tileH - offsetY, tileW + 1, tileH + 1);
    }
  }
}

function drawOverview() {
  if (!mesh) return;

  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  const scaleX = w / mesh.width;
  const scaleY = h / mesh.height;

  for (let y = 0; y < mesh.height; y++) {
    for (let x = 0; x < mesh.width; x++) {
      const i = (y * mesh.width + x) * 3;
      const height = mesh.positions[i + 2];
      const normal = [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]];
      const shade = getShade(normal);

      overviewCtx.fillStyle = heightToColor(height, shade);
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
  const dx = cx - lastX;
  const dy = cy - lastY;

  if (dragTarget === "detail") {
    viewX -= dx / (detailCanvas.width / viewWidth);
    viewY -= dy / (detailCanvas.height / viewHeight);
  } else {
    const scaleX = overviewCanvas.width / mesh.width;
    const scaleY = overviewCanvas.height / mesh.height;
    viewX -= (dx / scaleX) * RENDER_SCALE;
    viewY -= (dy / scaleY) * RENDER_SCALE;
  }

  clampView();
  lastX = cx; lastY = cy;
  drawAll();
}

function endDrag(cx, cy) {
  if (dragTarget === "overview" && cx !== undefined) {
    if (Math.hypot(cx - dragStartX, cy - dragStartY) < 6) {
      handleMinimapClick(cx, cy);
    }
  }
  isDragging = false;
  dragTarget = null;
}

function handleMinimapClick(cx, cy) {
  const rect = overviewCanvas.getBoundingClientRect();
  const mx = cx - rect.left;
  const my = cy - rect.top;
  const scaleX = overviewCanvas.width / mesh.width;
  const scaleY = overviewCanvas.height / mesh.height;

  viewX = (mx / scaleX) * RENDER_SCALE - viewWidth / 2;
  viewY = (my / scaleY) * RENDER_SCALE - viewHeight / 2;
  clampView();
  drawAll();
}

// Udalosti
detailCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "detail"); });
detailCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseleave", () => endDrag());

detailCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail"); }, { passive: false });
detailCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
detailCanvas.addEventListener("touchend", e => { if (e.changedTouches[0]) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

overviewCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "overview"); });
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseleave", () => endDrag());

overviewCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview"); }, { passive: false });
overviewCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
overviewCanvas.addEventListener("touchend", e => { if (e.changedTouches[0]) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

minimapSlider.addEventListener("input", () => { updateMinimapSize(); drawAll(); });
window.addEventListener("resize", () => { updateCanvasSizes(); drawAll(); });

// ======================
// Štart
// ======================
async function init() {
  try {
    heightData = await loadHeightmap();
    mesh = buildMesh(heightData);

    if (infoDiv) {
      infoDiv.textContent = `Mesh: \( {mesh.width}× \){mesh.height} bodov | Trojuholníky pripravené | 2D + tiene`;
    }

    minimapSlider.value = 72;
    updateCanvasSizes();
    viewX = (mesh.width * RENDER_SCALE - viewWidth) / 2;
    viewY = (mesh.height * RENDER_SCALE - viewHeight) / 2;
    clampView();
    drawAll();
  } catch (err) {
    console.error(err);
    if (infoDiv) infoDiv.textContent = "Chyba pri načítaní heightmapy";
  }
}

init();
