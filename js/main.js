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

const PAGE_SIZE = 420;

let viewWidth = 3;
let viewHeight = 4;

let viewX = 0;
let viewY = 0;

// Ťahanie – spoločné pre obe strany
let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null; // "detail" alebo "overview"

// ======================
// Načítanie mapy
// ======================
async function loadMap() {
  try {
    const response = await fetch("data/mapa.json");
    mapData = await response.json();

    detailCanvas.width = PAGE_SIZE;
    detailCanvas.height = PAGE_SIZE;
    overviewCanvas.width = PAGE_SIZE;
    overviewCanvas.height = PAGE_SIZE;

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

  detailCtx.clearRect(0, 0, PAGE_SIZE, PAGE_SIZE);

  const tileW = PAGE_SIZE / viewWidth;
  const tileH = PAGE_SIZE / viewHeight;
  const startX = Math.floor(viewX);
  const startY = Math.floor(viewY);

  for (let y = 0; y < viewHeight; y++) {
    for (let x = 0; x < viewWidth; x++) {
      const mapX = startX + x;
      const mapY = startY + y;

      if (mapX < 0 || mapX >= mapData.width || mapY < 0 || mapY >= mapData.height) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(x * tileW, y * tileH, tileW, tileH);
        continue;
      }

      const tile = mapData.tiles[mapY][mapX];
      detailCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      detailCtx.fillRect(x * tileW, y * tileH, tileW + 1, tileH + 1);

      detailCtx.strokeStyle = "rgba(0,0,0,0.25)";
      detailCtx.strokeRect(x * tileW, y * tileH, tileW, tileH);
    }
  }
}

function drawOverview() {
  if (!mapData) return;

  overviewCtx.clearRect(0, 0, PAGE_SIZE, PAGE_SIZE);

  const scaleX = PAGE_SIZE / mapData.width;
  const scaleY = PAGE_SIZE / mapData.height;

  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      overviewCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  const rx = Math.floor(viewX);
  const ry = Math.floor(viewY);

  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2.5;
  overviewCtx.strokeRect(
    rx * scaleX,
    ry * scaleY,
    viewWidth * scaleX,
    viewHeight * scaleY
  );
}

// ======================
// Spoločné funkcie ťahania
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
    // Ľavá strana – posúvame podľa veľkosti dlaždíc
    const tileW = PAGE_SIZE / viewWidth;
    const tileH = PAGE_SIZE / viewHeight;
    viewX -= dx / tileW;
    viewY -= dy / tileH;
  } 
  else if (dragTarget === "overview") {
    // Pravá strana – posúvame podľa mierky celej mapy
    const scaleX = PAGE_SIZE / mapData.width;
    const scaleY = PAGE_SIZE / mapData.height;
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
// ĽAVÁ strana – myš
// ======================
detailCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});

detailCanvas.addEventListener("mousemove", (e) => {
  moveDrag(e.clientX, e.clientY);
});

detailCanvas.addEventListener("mouseup", endDrag);
detailCanvas.addEventListener("mouseleave", endDrag);

// ======================
// ĽAVÁ strana – prst
// ======================
detailCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  startDrag(t.clientX, t.clientY, "detail");
}, { passive: false });

detailCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  moveDrag(t.clientX, t.clientY);
}, { passive: false });

detailCanvas.addEventListener("touchend", endDrag);
detailCanvas.addEventListener("touchcancel", endDrag);

// ======================
// PRAVÁ strana – myš
// ======================
overviewCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});

overviewCanvas.addEventListener("mousemove", (e) => {
  moveDrag(e.clientX, e.clientY);
});

overviewCanvas.addEventListener("mouseup", endDrag);
overviewCanvas.addEventListener("mouseleave", endDrag);

// ======================
// PRAVÁ strana – prst
// ======================
overviewCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  startDrag(t.clientX, t.clientY, "overview");
}, { passive: false });

overviewCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const t = e.touches[0];
  moveDrag(t.clientX, t.clientY);
}, { passive: false });

overviewCanvas.addEventListener("touchend", endDrag);
overviewCanvas.addEventListener("touchcancel", endDrag);

// ======================
// Spustenie
// ======================
loadMap();
