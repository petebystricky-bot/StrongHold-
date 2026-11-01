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

// Veľkosť jednej strany knihy (v pixeloch)
const PAGE_SIZE = 420;

// Detailný pohľad – koľko políčok zobrazujeme
let viewWidth = 3;   // 3 políčka na šírku
let viewHeight = 4;  // 4 políčka na výšku

// Pozícia detailného pohľadu (ľavý horný roh v súradniciach mapy)
let viewX = 0;
let viewY = 0;

// Ťahanie na ľavej strane
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

    // Nastavíme rovnakú veľkosť oboch canvasov
    detailCanvas.width = PAGE_SIZE;
    detailCanvas.height = PAGE_SIZE;
    overviewCanvas.width = PAGE_SIZE;
    overviewCanvas.height = PAGE_SIZE;

    // Začíname približne v strede mapy
    viewX = Math.floor(mapData.width / 2 - viewWidth / 2);
    viewY = Math.floor(mapData.height / 2 - viewHeight / 2);

    drawAll();
    console.log("Mapa načítaná");
  } catch (error) {
    console.error(error);
    infoDiv.textContent = "Chyba pri načítaní mapy.";
  }
}

// ======================
// Vykreslenie oboch strán
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

// ----- Ľavá strana (detail) -----
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

      // Jemná mriežka
      detailCtx.strokeStyle = "rgba(0,0,0,0.2)";
      detailCtx.strokeRect(x * tileW, y * tileH, tileW, tileH);
    }
  }
}

// ----- Pravá strana (celá mapa + rámček) -----
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

  // Zelený rámček = čo je práve vidieť na ľavej strane
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
// Ovládanie – ĽAVÁ strana (drag)
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

  // Posunieme pohľad (záporný smer, lebo ťaháme mapu)
  viewX -= dx / tileW;
  viewY -= dy / tileH;

  // Obmedzenie, aby sme nevyhli von z mapy
  viewX = Math.max(0, Math.min(mapData.width - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapData.height - viewHeight, viewY));

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  drawAll();
});

detailCanvas.addEventListener("mouseup", () => isDragging = false);
detailCanvas.addEventListener("mouseleave", () => isDragging = false);

// ======================
// Ovládanie – PRAVÁ strana (klik)
// ======================
overviewCanvas.addEventListener("click", (e) => {
  if (!mapData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const scaleX = PAGE_SIZE / mapData.width;
  const scaleY = PAGE_SIZE / mapData.height;

  // Prepočet na súradnice mapy
  const clickedX = mouseX / scaleX;
  const clickedY = mouseY / scaleY;

  // Vycentrujeme detailný pohľad na kliknuté miesto
  viewX = clickedX - viewWidth / 2;
  viewY = clickedY - viewHeight / 2;

  // Obmedzenie
  viewX = Math.max(0, Math.min(mapData.width - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapData.height - viewHeight, viewY));

  drawAll();
});

// ======================
// Spustenie
// ======================
loadMap();
