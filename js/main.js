// ======================
// Farby podľa výšky (0–1500 m)
// ======================
function heightToColor(height) {
  const t = Math.max(0, Math.min(1, height / 1500));

  // plynulý prechod: modrá → zelená → hnedá → biela
  if (t < 0.2) { // nízko / voda
    const k = t / 0.2;
    return `rgb(${20 + k * 30}, ${60 + k * 70}, ${120 + k * 60})`;
  } else if (t < 0.45) { // nížiny / tráva
    const k = (t - 0.2) / 0.25;
    return `rgb(${50 + k * 50}, ${130 + k * 40}, ${60 - k * 20})`;
  } else if (t < 0.7) { // svahy / skala
    const k = (t - 0.45) / 0.25;
    return `rgb(${120 + k * 40}, ${100 - k * 20}, ${60 - k * 20})`;
  } else { // vysoké hory / sneh
    const k = (t - 0.7) / 0.3;
    return `rgb(${160 + k * 95}, ${150 + k * 105}, ${140 + k * 115})`;
  }
}

// ======================
// Premenné
// ======================
let heightData = null;       // 36 × 64
let mapWidth = 36;           // v sub-tiles
let mapHeight = 64;

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas.getContext("2d");
const overviewCtx = overviewCanvas.getContext("2d");
const infoDiv = document.getElementById("info");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

let viewWidth = 12;          // koľko sub-tiles vidíme na šírku
let viewHeight = 16;
let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;
let dragStartX = 0;
let dragStartY = 0;

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

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const heights = [];
      for (let y = 0; y < img.height; y++) {
        const row = [];
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const brightness = data[i];
          const height = (brightness / 255) * 1500;
          row.push(height);
        }
        heights.push(row);
      }

      mapWidth = img.width;
      mapHeight = img.height;
      resolve(heights);
    };

    img.onerror = () => reject(new Error("Nepodarilo sa načítať data/heightmap.png"));
    img.src = "data/heightmap.png";
  });
}

// ======================
// Počet viditeľných sub-tiles
// ======================
function calculateViewSize() {
  const w = detailCanvas.width;
  const h = detailCanvas.height;
  const aspect = w / h;

  // Základný počet sub-tiles na obrazovke
  let cols = 12;
  let rows = 16;

  if (aspect >= 1) {
    rows = 12;
    cols = Math.max(12, Math.round(rows * aspect));
  } else {
    cols = 12;
    rows = Math.max(12, Math.round(cols / aspect));
  }

  // Obmedzenie, aby sme nevideli viac než celú mapu
  cols = Math.min(cols, mapWidth);
  rows = Math.min(rows, mapHeight);

  viewWidth = cols;
  viewHeight = rows;
}

// ======================
// Minimap veľkosť
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
// Canvas sizes
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

function clampView() {
  viewX = Math.max(0, Math.min(mapWidth - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapHeight - viewHeight, viewY));
}

// ======================
// Načítanie
// ======================
async function loadAll() {
  try {
    heightData = await loadHeightmap();

    minimapSlider.value = 72;
    updateCanvasSizes();

    viewX = (mapWidth - viewWidth) / 2;
    viewY = (mapHeight - viewHeight) / 2;
    clampView();
    drawAll();

    if (infoDiv) infoDiv.textContent = `Heightmapa \( {mapWidth}× \){mapHeight} načítaná`;
  } catch (err) {
    console.error(err);
    if (infoDiv) infoDiv.textContent = "Chyba pri načítaní heightmapy";
  }
}

// ======================
// Vykreslenie – teraz po sub-tiles
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!heightData) return;

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

      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);
        continue;
      }

      const height = heightData[mapY][mapX];
      detailCtx.fillStyle = heightToColor(height);
      detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);
    }
  }
}

function drawOverview() {
  if (!heightData) return;

  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  const scaleX = w / mapWidth;
  const scaleY = h / mapHeight;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const height = heightData[y][x];
      overviewCtx.fillStyle = heightToColor(height);
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  // Zelený rámček
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    viewX * scaleX,
    viewY * scaleY,
    viewWidth * scaleX,
    viewHeight * scaleY
  );
}

// ======================
// Ovládanie
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
  if (!isDragging || !heightData) return;

  const dx = clientX - lastX;
  const dy = clientY - lastY;

  if (dragTarget === "detail") {
    const tileW = detailCanvas.width / viewWidth;
    const tileH = detailCanvas.height / viewHeight;
    viewX -= dx / tileW;
    viewY -= dy / tileH;
  } else if (dragTarget === "overview") {
    const scaleX = overviewCanvas.width / mapWidth;
    const scaleY = overviewCanvas.height / mapHeight;
    viewX -= dx / scaleX;
    viewY -= dy / scaleY;
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
  if (!heightData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const scaleX = overviewCanvas.width / mapWidth;
  const scaleY = overviewCanvas.height / mapHeight;

  viewX = mouseX / scaleX - viewWidth / 2;
  viewY = mouseY / scaleY - viewHeight / 2;

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
detailCanvas.addEventListener("touchend", e => { if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

overviewCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "overview"); });
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseleave", () => endDrag());

overviewCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview"); }, { passive: false });
overviewCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
overviewCanvas.addEventListener("touchend", e => { if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

minimapSlider.addEventListener("input", () => { updateMinimapSize(); drawAll(); });
window.addEventListener("resize", () => { updateCanvasSizes(); drawAll(); });

// Spustenie
loadAll();
