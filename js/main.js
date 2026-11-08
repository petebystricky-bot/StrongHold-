Tu máš kompletný aktuálny `js/main.js`:

```js
// ======================
// Farby terénu
// ======================
const TERRAIN_COLORS = {
  snow:   "#e8eef4",
  water:  "#3b82f6",
  grass:  "#4ade80",
  rock:   "#6b7280",
  sand:   "#fbbf24",
  forest: "#166534",
  road:   "#a8a29e"
};

// ======================
// Premenné
// ======================
let mapData = null;

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

// ======================
// Výpočet počtu políčok
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
// Veľkosť minimapy podľa posuvníka (0–100)
// ======================
function updateMinimapSize() {
  const value = Number(minimapSlider.value); // 0 až 100

  // Otočené: 0 = maximálna veľkosť, 100 = minimálna
  const inverted = 100 - value;

  const minSize = 50;
  const maxSize = Math.floor(window.innerWidth * 0.48);

  const size = Math.floor(minSize + (maxSize - minSize) * (inverted / 100));

  overviewCanvas.width = size;
  overviewCanvas.height = size; // vždy štvorec

  // Keď je posuvník úplne vpravo, minimapu skryjeme
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
  const barHeight = bar.offsetHeight;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  // Vzdialenosť minimapy od lišty = 6px
  const gap = 6;
  minimapContainer.style.bottom = (barHeight + gap) + "px";

  calculateViewSize();
  updateMinimapSize();
  clampView();
}

// ======================
// Načítanie mapy
// ======================
async function loadMap() {
  try {
    const response = await fetch("data/mapa.json");
    mapData = await response.json();

    updateCanvasSizes();

    viewX = (mapData.width - viewWidth) / 2;
    viewY = (mapData.height - viewHeight) / 2;

    clampView();
    drawAll();
    console.log("Mapa načítaná");
  } catch (error) {
    console.error(error);
    infoDiv.textContent = "Chyba pri načítaní mapy.";
  }
}

function clampView() {
  if (!mapData) return;
  viewX = Math.max(0, Math.min(mapData.width - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapData.height - viewHeight, viewY));
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

      const tile = mapData.tiles[mapY][mapX];
      detailCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);

      detailCtx.strokeStyle = "rgba(0,0,0,0.2)";
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
      const tile = mapData.tiles[y][x];
      overviewCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      overviewCtx.fillRect(
        offsetX + x * scale,
        offsetY + y * scale,
        scale + 0.5,
        scale + 0.5
      );
    }
  }

  // Zelený rámček
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
    if (dist < 6) {
      handleMinimapClick(clientX, clientY);
    }
  }

  isDragging = false;
  dragTarget = null;
}

// ======================
// Kliknutie na minimapu
// ======================
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
// Udalosti – Detail
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
  if (e.changedTouches.length > 0) {
    endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  } else {
    endDrag();
  }
});
detailCanvas.addEventListener("touchcancel", () => endDrag());

// ======================
// Udalosti – Minimap
// ======================
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
  if (e.changedTouches.length > 0) {
    endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  } else {
    endDrag();
  }
});
overviewCanvas.addEventListener("touchcancel", () => endDrag());

// ======================
// Posuvník minimapy
// ======================
minimapSlider.addEventListener("input", () => {
  updateMinimapSize();
  drawAll();
});

// ======================
// Resize
// ======================
window.addEventListener("resize", () => {
  updateCanvasSizes();
  drawAll();
});

// ======================
// Spustenie
// ======================
loadMap();
```
