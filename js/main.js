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

const btnFullscreen = document.getElementById("btnFullscreen");
const btnToggleMinimap = document.getElementById("btnToggleMinimap");

let PAGE_SIZE = 360;
let isFullscreen = false;
let isMinimapVisible = true;

let viewWidth = 3;
let viewHeight = 4;

let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;

// ======================
// Veľkosť canvasov
// ======================
function updateCanvasSizes() {
  if (isFullscreen) {
    // Detail vyplní takmer celú obrazovku
    const w = window.innerWidth - 20;
    const h = window.innerHeight - 120;

    detailCanvas.width = w;
    detailCanvas.height = h;

    // Minimap má pevnú veľkosť
    overviewCanvas.width = 170;
    overviewCanvas.height = 170;
  } else {
    // Normálny režim – dve strany
    const available = window.innerWidth - 40;
    PAGE_SIZE = Math.floor(available / 2);
    if (PAGE_SIZE < 260) PAGE_SIZE = 260;
    if (PAGE_SIZE > 480) PAGE_SIZE = 480;

    detailCanvas.width = PAGE_SIZE;
    detailCanvas.height = PAGE_SIZE;
    overviewCanvas.width = PAGE_SIZE;
    overviewCanvas.height = PAGE_SIZE;
  }
}

// ======================
// Načítanie mapy
// ======================
async function loadMap() {
  try {
    const response = await fetch("data/mapa.json");
    mapData = await response.json();

    updateCanvasSizes();

    viewX = mapData.width / 2 - viewWidth / 2;
    viewY = mapData.height / 2 - viewHeight / 2;

    clampView();
    drawAll();
    console.log("Mapa načítaná");
  } catch (error) {
    console.error(error);
    infoDiv.textContent = "Chyba pri načítaní mapy.";
  }
}

function clampView() {
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

      detailCtx.strokeStyle = "rgba(0,0,0,0.25)";
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
detailCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});
detailCanvas.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseup", endDrag);
detailCanvas.addEventListener("mouseleave", endDrag);

detailCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail");
}, { passive: false });
detailCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
detailCanvas.addEventListener("touchend", endDrag);
detailCanvas.addEventListener("touchcancel", endDrag);

// ======================
// Udalosti – Overview / Minimap
// ======================
overviewCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", endDrag);
overviewCanvas.addEventListener("mouseleave", endDrag);

overviewCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", endDrag);
overviewCanvas.addEventListener("touchcancel", endDrag);

// ======================
// Tlačidlá
// ======================
btnFullscreen.addEventListener("click", () => {
  isFullscreen = !isFullscreen;

  if (isFullscreen) {
    document.body.classList.add("fullscreen-mode");
    btnFullscreen.textContent = "Ukončiť celú obrazovku";
    btnToggleMinimap.style.display = "inline-block";
  } else {
    document.body.classList.remove("fullscreen-mode");
    document.body.classList.remove("minimap-hidden");
    btnFullscreen.textContent = "Celá obrazovka";
    btnToggleMinimap.style.display = "none";
    isMinimapVisible = true;
    btnToggleMinimap.textContent = "Skryť minimapu";
  }

  updateCanvasSizes();
  drawAll();
});

btnToggleMinimap.addEventListener("click", () => {
  isMinimapVisible = !isMinimapVisible;

  if (isMinimapVisible) {
    document.body.classList.remove("minimap-hidden");
    btnToggleMinimap.textContent = "Skryť minimapu";
  } else {
    document.body.classList.add("minimap-hidden");
    btnToggleMinimap.textContent = "Zobraziť minimapu";
  }
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
