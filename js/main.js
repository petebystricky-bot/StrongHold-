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

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const btnC = document.getElementById("btnC");

let minimapMode = "a";          // a | b | c
let viewWidth = 4;
let viewHeight = 3;

let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;

// ======================
// Výpočet počtu políčok (aby boli čo najviac štvorcové)
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

  // Jemné doladenie pomeru
  const tileAspect = (w / cols) / (h / rows);
  if (tileAspect > 1.18) cols++;
  if (tileAspect < 0.85) rows++;

  viewWidth = cols;
  viewHeight = rows;
}

// ======================
// Nastavenie veľkosti minimapy podľa režimu a/b/c
// ======================
function updateMinimapSize() {
  if (!mapData) return;

  const mapAspect = mapData.width / mapData.height;
  let miniW, miniH;

  if (minimapMode === "a") {
    // Malý štvorec – približne veľkosť jedného políčka na hlavnej mape
    const tileSize = Math.min(detailCanvas.width / viewWidth, detailCanvas.height / viewHeight);
    miniW = Math.max(70, Math.floor(tileSize * 1.1));
    miniH = Math.floor(miniW / mapAspect);
  } 
  else if (minimapMode === "b") {
    // Polovica obrazovky (ako knižný režim)
    miniW = Math.floor(window.innerWidth * 0.42);
    miniH = Math.floor(miniW / mapAspect);
  } 
  else {
    // c = minimalizované – nechávame malú veľkosť, ale kontajner skryjeme
    miniW = 80;
    miniH = Math.floor(miniW / mapAspect);
  }

  overviewCanvas.width = miniW;
  overviewCanvas.height = miniH;
}

// ======================
// Veľkosti canvasov
// ======================
function updateCanvasSizes() {
  // Hlavná mapa vždy na celú dostupnú plochu
  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - 42;  // odpočítame spodný panel

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

    // Vycentrujeme pohľad na stred mapy
    viewX = (mapData.width - viewWidth) / 2;
    viewY = (mapData.height - viewHeight) / 2;

    clampView();
    drawAll();
    setActiveButton("a");
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

  const scaleX = w / mapData.width;
  const scaleY = h / mapData.height;

  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      overviewCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

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
// Ťahanie
// ======================
function startDrag(clientX, clientY, target) {
  isDragging = true;
  lastX = clientX;
  lastY = clientY;
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
    const scaleX = overviewCanvas.width / mapData.width;
    const scaleY = overviewCanvas.height / mapData.height;
    viewX -= dx / scaleX;
    viewY -= dy / scaleY;
  }

  clampView();
  lastX = clientX;
  lastY = clientY;
  drawAll();
}

function endDrag() {
  isDragging = false;
  dragTarget = null;
}

// ======================
// Udalosti – Detail
// ======================
detailCanvas.addEventListener("mousedown", e => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});
detailCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseup", endDrag);
detailCanvas.addEventListener("mouseleave", endDrag);

detailCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail");
}, { passive: false });
detailCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
detailCanvas.addEventListener("touchend", endDrag);
detailCanvas.addEventListener("touchcancel", endDrag);

// ======================
// Udalosti – Minimap
// ======================
overviewCanvas.addEventListener("mousedown", e => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", endDrag);
overviewCanvas.addEventListener("mouseleave", endDrag);

overviewCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", endDrag);
overviewCanvas.addEventListener("touchcancel", endDrag);

// ======================
// Tlačidlá a / b / c
// ======================
function setActiveButton(mode) {
  btnA.classList.toggle("active", mode === "a");
  btnB.classList.toggle("active", mode === "b");
  btnC.classList.toggle("active", mode === "c");
}

function setMinimapMode(mode) {
  minimapMode = mode;
  setActiveButton(mode);

  if (mode === "c") {
    minimapContainer.classList.add("hidden");
  } else {
    minimapContainer.classList.remove("hidden");
  }

  updateMinimapSize();
  drawAll();
}

btnA.addEventListener("click", () => setMinimapMode("a"));
btnB.addEventListener("click", () => setMinimapMode("b"));
btnC.addEventListener("click", () => setMinimapMode("c"));

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
