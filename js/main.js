// ======================
// Farby podľa výšky
// ======================
function heightToColor(height) {
  // 0 m → tmavomodrá (voda/nížina)
  // 500 m → zelená
  // 1000 m → hnedá
  // 1500 m → biela (sneh)
  const t = Math.max(0, Math.min(1, height / 1500));

  if (t < 0.25) {
    // nízke polohy – modrozelená
    const k = t / 0.25;
    return `rgb(${30 + k * 40}, ${90 + k * 80}, ${140 + k * 40})`;
  } else if (t < 0.5) {
    // stredné – zelená
    const k = (t - 0.25) / 0.25;
    return `rgb(${70 + k * 60}, ${170 - k * 40}, ${80 - k * 30})`;
  } else if (t < 0.75) {
    // vyššie – hnedá / skala
    const k = (t - 0.5) / 0.25;
    return `rgb(${130 + k * 50}, ${110 - k * 30}, ${70 - k * 20})`;
  } else {
    // najvyššie – sneh
    const k = (t - 0.75) / 0.25;
    return `rgb(${180 + k * 75}, ${170 + k * 85}, ${160 + k * 95})`;
  }
}

// ======================
// Premenné
// ======================
let mapData = null;          // pôvodná mapa (chunky)
let heightData = null;       // 36×64 výšky

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas.getContext("2d");
const overviewCtx = overviewCanvas.getContext("2d");
const infoDiv = document.getElementById("info");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

let viewWidth = 4;
let viewHeight = 3;
let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;
let dragStartX = 0;
let dragStartY = 0;

// Počet sub-tiles v jednom chunku
const SUB_W = 3;
const SUB_H = 4;

// ======================
// Načítanie heightmapy
// ======================
function loadHeightmap() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const heights = [];
      for (let y = 0; y < img.height; y++) {
        const row = [];
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const brightness = data[i]; // 0–255
          const height = (brightness / 255) * 1500;
          row.push(height);
        }
        heights.push(row);
      }
      resolve(heights);
    };

    img.onerror = () => reject(new Error("Nepodarilo sa načítať data/heightmap.png"));
    img.src = "data/heightmap.png";
  });
}

// ======================
// Výpočet počtu chunkov na obrazovke
// ======================
function calculateViewSize() {
  const w = detailCanvas.width;
  const h = detailCanvas.height;
  const aspect = w / h;

  let cols = 4;
  let rows = 3;

  if (aspect >= 1) {
    rows = 3;
    cols = Math.max(4, Math.round(rows * aspect));
  } else {
    cols = 3;
    rows = Math.max(4, Math.round(cols / aspect));
  }

  const tileAspect = (w / cols) / (h / rows);
  if (tileAspect > 1.18) cols++;
  if (tileAspect < 0.85) rows++;

  viewWidth = cols;
  viewHeight = rows;
}

// ======================
// Veľkosť minimapy
// ======================
function updateMinimapSize() {
  const value = Number(minimapSlider.value);
  const inverted = 100 - value;

  const minSize = 50;
  const maxSize = Math.floor(window.innerWidth * 0.48);
  const size = Math.floor(minSize + (maxSize - minSize) * (inverted / 100));

  overviewCanvas.width = size;
  overviewCanvas.height = size;

  if (value >= 98) {
    minimapContainer.classList.add("hidden");
  } else {
    minimapContainer.classList.remove("hidden");
  }
}

// ======================
// Veľkosti canvasov
// ======================
function updateCanvasSizes() {
  const bar = document.getElementById("bottom-bar");
  const barHeight = bar ? bar.offsetHeight : 48;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  const gap = 6;
  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + gap) + "px";
  }

  calculateViewSize();
  updateMinimapSize();
  clampView();
}

// ======================
// Načítanie všetkého
// ======================
async function loadAll() {
  try {
    // 1. Heightmapa
    heightData = await loadHeightmap();
    console.log("Heightmapa načítaná:", heightData[0].length, "×", heightData.length);

    // 2. Pôvodná mapa (chunky) – ak existuje
    try {
      const response = await fetch("data/mapa.json");
      mapData = await response.json();
    } catch (e) {
      // Ak mapa.json nie je, vytvoríme prázdnu štruktúru
      mapData = {
        width: 12,
        height: 16,
        tiles: Array.from({ length: 16 }, () =>
          Array.from({ length: 12 }, () => ({ terrain: "grass", height: 0 }))
        )
      };
    }

    minimapSlider.value = 72;
    updateCanvasSizes();

    viewX = (mapData.width - viewWidth) / 2;
    viewY = (mapData.height - viewHeight) / 2;
    clampView();
    drawAll();

    if (infoDiv) infoDiv.textContent = "Mapa s výškami načítaná";
  } catch (err) {
    console.error(err);
    if (infoDiv) infoDiv.textContent = "Chyba pri načítaní heightmapy";
  }
}

function clampView() {
  if (!mapData) return;
  viewX = Math.max(0, Math.min(mapData.width - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapData.height - viewHeight, viewY));
}

// ======================
// Získanie výšky pre chunk (priemer sub-tiles)
// ======================
function getChunkHeight(chunkX, chunkY) {
  if (!heightData) return 0;

  let sum = 0;
  let count = 0;

  for (let sy = 0; sy < SUB_H; sy++) {
    for (let sx = 0; sx < SUB_W; sx++) {
      const hx = chunkX * SUB_W + sx;
      const hy = chunkY * SUB_H + sy;

      if (hy < heightData.length && hx < heightData[0].length) {
        sum += heightData[hy][hx];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

// ======================
// Vykreslenie
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!mapData) return;

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
      const mapX = startX + x;
      const mapY = startY + y;
      const screenX = x * tileW - offsetX;
      const screenY = y * tileH - offsetY;

      if (mapX < 0 || mapX >= mapData.width || mapY < 0 || mapY >= mapData.height) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);
        continue;
      }

      const height = getChunkHeight(mapX, mapY);
      detailCtx.fillStyle = heightToColor(height);
      detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);

      detailCtx.strokeStyle = "rgba(0,0,0,0.15)";
      detailCtx.strokeRect(screenX, screenY, tileW, tileH);
    }
  }
}

function drawOverview() {
  if (!mapData) return;

  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  const scale = Math.min(w / mapData.width, h / mapData.height);
  const offsetX = (w - mapData.width * scale) / 2;
  const offsetY = (h - mapData.height * scale) / 2;

  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const height = getChunkHeight(x, y);
      overviewCtx.fillStyle = heightToColor(height);
      overviewCtx.fillRect(
        offsetX + x * scale,
        offsetY + y * scale,
        scale + 0.5,
        scale + 0.5
      );
    }
  }

  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    offsetX + viewX * scale,
    offsetY + viewY * scale,
    viewWidth * scale,
    viewHeight * scale
  );
}

// ======================
// Ťahanie
// ======================
function startDrag(clientX, clientY, target) {
  isDragging = true;
  lastX = clientX;
  lastY = clientY;
  dragStartX = clientX;
  dragStartY = clientY;
  dragTarget = target;
}

function moveDrag(clientX, clientY) {
  if (!isDragging || !mapData) return;

  const dx = clientX - lastX;
  const dy = clientY - lastY;

  if (dragTarget === "detail") {
    const tileW = detailCanvas.width / viewWidth;
    const tileH = detailCanvas.height / viewHeight;
    viewX -= dx / tileW;
    viewY -= dy / tileH;
  } else if (dragTarget === "overview") {
    const w = overviewCanvas.width;
    const h = overviewCanvas.height;
    const scale = Math.min(w / mapData.width, h / mapData.height);
    viewX -= dx / scale;
    viewY -= dy / scale;
  }

  clampView();
  lastX = clientX;
  lastY = clientY;
  drawAll();
}

function endDrag(clientX, clientY) {
  if (dragTarget === "overview" && clientX !== undefined) {
    const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
    if (dist < 6) handleMinimapClick(clientX, clientY);
  }
  isDragging = false;
  dragTarget = null;
}

function handleMinimapClick(clientX, clientY) {
  if (!mapData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  const scale = Math.min(w / mapData.width, h / mapData.height);
  const offsetX = (w - mapData.width * scale) / 2;
  const offsetY = (h - mapData.height * scale) / 2;

  const mapClickX = (mouseX - offsetX) / scale;
  const mapClickY = (mouseY - offsetY) / scale;

  viewX = mapClickX - viewWidth / 2;
  viewY = mapClickY - viewHeight / 2;

  clampView();
  drawAll();
}

// ======================
// Udalosti
// ======================
detailCanvas.addEventListener("mousedown", e => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});
detailCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseleave", () => endDrag());

detailCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail");
}, { passive: false });
detailCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
detailCanvas.addEventListener("touchend", e => {
  if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  else endDrag();
});

overviewCanvas.addEventListener("mousedown", e => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseleave", () => endDrag());

overviewCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", e => {
  if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  else endDrag();
});

minimapSlider.addEventListener("input", () => {
  updateMinimapSize();
  drawAll();
});

window.addEventListener("resize", () => {
  updateCanvasSizes();
  drawAll();
});

// ======================
// Spustenie
// ======================
loadAll();
