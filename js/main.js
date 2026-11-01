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

// Pozícia pohľadu (môže byť desatinná počas ťahania)
let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

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

// ======================
// Obmedzenie pohľadu
// ======================
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

  // Pri kreslení používame zaokrúhlené hodnoty
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

  // Rámček (používame zaokrúhlené hodnoty)
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
// Spoločná funkcia pre začiatok ťahania
// ======================
function startDrag(clientX, clientY) {
  isDragging = true;
  lastMouseX = clientX;
  lastMouseY = clientY;
}

// ======================
// Spoločná funkcia pre pohyb
// ======================
function moveDrag(clientX, clientY) {
  if (!isDragging || !mapData) return;

  const dx = clientX - lastMouseX;
  const dy = clientY - lastMouseY;

  const tileW = PAGE_SIZE / viewWidth;
  const tileH = PAGE_SIZE / viewHeight;

  // Prirodzené ťahanie mapy (ako Google Maps)
  viewX -= dx / tileW;
  viewY -= dy / tileH;

  clampView();

  lastMouseX = clientX;
  lastMouseY = clientY;

  drawAll();
}

function endDrag() {
  isDragging = false;
}

// ======================
// MYŠ
// ======================
detailCanvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  startDrag(e.clientX, e.clientY);
});

detailCanvas.addEventListener("mousemove", (e) => {
  moveDrag(e.clientX, e.clientY);
});

detailCanvas.addEventListener("mouseup", endDrag);
detailCanvas.addEventListener("mouseleave", endDrag);

// ======================
// PRST (tablet / mobil)
// ======================
detailCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  startDrag(touch.clientX, touch.clientY);
}, { passive: false });

detailCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  moveDrag(touch.clientX, touch.clientY);
}, { passive: false });

detailCanvas.addEventListener("touchend", endDrag);
detailCanvas.addEventListener("touchcancel", endDrag);

// ======================
// PRAVÁ strana – klik (myš aj prst)
// ======================
function handleOverviewClick(clientX, clientY) {
  if (!mapData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const scaleX = PAGE_SIZE / mapData.width;
  const scaleY = PAGE_SIZE / mapData.height;

  const clickedX = mouseX / scaleX;
  const clickedY = mouseY / scaleY;

  viewX = clickedX - viewWidth / 2;
  viewY = clickedY - viewHeight / 2;

  clampView();
  drawAll();
}

overviewCanvas.addEventListener("click", (e) => {
  handleOverviewClick(e.clientX, e.clientY);
});

overviewCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleOverviewClick(touch.clientX, touch.clientY);
}, { passive: false });

// ======================
// Spustenie
// ======================
loadMap();
