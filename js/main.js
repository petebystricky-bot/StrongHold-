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

// Veľkosť jednej strany knihy
const PAGE_SIZE = 420;

// Koľko políčok zobrazujeme v detaile
let viewWidth = 3;
let viewHeight = 4;

// Pozícia detailného pohľadu (vždy celé čísla!)
let viewX = 0;
let viewY = 0;

// Ťahanie
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

    // Začíname približne v strede
    viewX = Math.floor(mapData.width / 2 - viewWidth / 2);
    viewY = Math.floor(mapData.height / 2 - viewHeight / 2);

    // Bezpečnostné obmedzenie
    clampView();

    drawAll();
    console.log("Mapa načítaná");
  } catch (error) {
    console.error(error);
    infoDiv.textContent = "Chyba pri načítaní mapy.";
  }
}

// ======================
// Obmedzenie pohľadu, aby nevychádzal z mapy
// ======================
function clampView() {
  viewX = Math.max(0, Math.min(mapData.width - viewWidth, Math.floor(viewX)));
  viewY = Math.max(0, Math.min(mapData.height - viewHeight, Math.floor(viewY)));
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

  for (let y = 0; y < viewHeight; y++) {
    for (let x = 0; x < viewWidth; x++) {
      const mapX = viewX + x;
      const mapY = viewY + y;

      if (mapX < 0 || mapX >= mapData.width || mapY < 0 || mapY >= mapData.height) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(x * tileW, y * tileH, tileW, tileH);
        continue;
      }

      const tile = mapData.tiles[mapY][mapX];
      detailCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      detailCtx.fillRect(x * tileW, y * tileH, tileW + 1, tileH + 1);

      // Mriežka
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

  // Celá mapa
  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      overviewCtx.fillStyle = TERRAIN_COLORS[tile.terrain] || "#ff00ff";
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  // Zelený rámček
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2.5;
  overviewCtx.strokeRect(
    viewX * scaleX,
    viewY * scaleY,
    viewWidth * scaleX,
    viewHeight * scaleY
  );
}

// ======================
// ĽAVÁ strana – ťahanie
// ======================
detailCanvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

detailCanvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !mapData) return;

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  const tileW = PAGE_SIZE / viewWidth;
  const tileH = PAGE_SIZE / viewHeight;

  // Posun (záporný, lebo ťaháme mapu)
  viewX -= dx / tileW;
  viewY -= dy / tileH;

  clampView();          // ← dôležité! zaokrúhli a obmedzí

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  drawAll();
});

detailCanvas.addEventListener("mouseup", () => isDragging = false);
detailCanvas.addEventListener("mouseleave", () => isDragging = false);

// ======================
// PRAVÁ strana – klik
// ======================
overviewCanvas.addEventListener("click", (e) => {
  if (!mapData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const scaleX = PAGE_SIZE / mapData.width;
  const scaleY = PAGE_SIZE / mapData.height;

  // Kliknuté políčko
  const clickedX = mouseX / scaleX;
  const clickedY = mouseY / scaleY;

  // Vycentrujeme pohľad
  viewX = clickedX - viewWidth / 2;
  viewY = clickedY - viewHeight / 2;

  clampView();
  drawAll();
});

// ======================
// Spustenie
// ======================
loadMap();
