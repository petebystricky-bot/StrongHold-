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

let minimapMode = "a";
let viewWidth = 4;
let viewHeight = 3;

let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;

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
// Veľkosť minimapy (rovnaký pomer strán pri A aj B)
// ======================
function updateMinimapSize() {
  if (!mapData) return;

  const mapAspect = mapData.width / mapData.height;
  let miniW;

  if (minimapMode === "a") {
    miniW = Math.floor(window.innerWidth * 0.16);   // malá
  } else if (minimapMode === "b") {
    miniW = Math.floor(window.innerWidth * 0.38);   // väčšia (polovica-ish)
  } else {
    miniW = 80;
  }

  const miniH = Math.floor(miniW / mapAspect);

  overviewCanvas.width = miniW;
  overviewCanvas.height = miniH;
}

// ======================
// Veľkosti canvasov
// ======================
function updateCanvasSizes() {
  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - 42;

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
// Kliknutie na minimapu = presun pohľadu
// ======================
function handleMinimapClick(clientX, clientY) {
  if (!mapData || minimapMode === "c") return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const scaleX = overviewCanvas.width / mapData.width;
  const scaleY = overviewCanvas.height / mapData.height;

  // Prepočet na súradnice mapy
  const mapClickX = mouseX / scaleX;
  const mapClickY = mouseY / scaleY;

  // Vycentrujeme pohľad na kliknuté miesto
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
// Udalosti – Minimap (ťahanie + klik)
// ======================
overviewCanvas.addEventListener("mousedown", e => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", e => {
  // Ak sme len klikli (neťahali), spravíme presun
  if (!isDragging || (Math.abs(e.clientX - lastX) < 4 && Math.abs(e.clientY - lastY) < 4)) {
    handleMinimapClick(e.clientX, e.clientY);
  }
  endDrag();
});
overviewCanvas.addEventListener("mouseleave", endDrag);

overviewCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", e => {
  endDrag();
});
overviewCanvas.addEventListener("touchcancel", endDrag);

// Pre touch klik (jednoduché ťuknutie)
overviewCanvas.addEventListener("click", e => {
  handleMinimapClick(e.clientX, e.clientY);
});

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
