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
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const infoDiv = document.getElementById("info");

// Kamera
let camera = {
  x: 0,
  y: 0,
  zoom: 0.35          // začneme oddialení, aby bolo vidieť viac mapy
};

// Ovládanie myšou
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let hasMoved = false;   // aby sme rozlíšili klik od ťahania

// ======================
// Načítanie mapy
// ======================
async function loadMap() {
  try {
    const response = await fetch("data/mapa.json");
    mapData = await response.json();

    // Canvas bude veľký ako okno prehliadača (nie celá mapa)
    resizeCanvas();
    draw();
    console.log("Mapa načítaná:", mapData.width, "×", mapData.height);
  } catch (error) {
    console.error("Chyba pri načítaní mapy:", error);
    infoDiv.textContent = "Chyba: Nepodarilo sa načítať mapu.";
  }
}

// ======================
// Prispôsobenie veľkosti canvasu
// ======================
function resizeCanvas() {
  canvas.width = window.innerWidth - 40;
  canvas.height = window.innerHeight - 120;
}

// ======================
// Vykreslenie (len viditeľná časť)
// ======================
function draw() {
  if (!mapData) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const tileSize = mapData.tileSize * camera.zoom;

  // Vypočítame, ktoré políčka sú viditeľné
  const startX = Math.max(0, Math.floor(-camera.x / tileSize));
  const startY = Math.max(0, Math.floor(-camera.y / tileSize));
  const endX = Math.min(mapData.width, Math.ceil((canvas.width - camera.x) / tileSize) + 1);
  const endY = Math.min(mapData.height, Math.ceil((canvas.height - camera.y) / tileSize) + 1);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = mapData.tiles[y][x];
      const color = TERRAIN_COLORS[tile.terrain] || "#ff00ff";

      const screenX = x * tileSize + camera.x;
      const screenY = y * tileSize + camera.y;

      ctx.fillStyle = color;
      ctx.fillRect(screenX, screenY, tileSize + 0.5, tileSize + 0.5);
    }
  }
}

// ======================
// Ovládanie myšou – posúvanie
// ======================
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  hasMoved = false;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    hasMoved = true;
  }

  camera.x += dx;
  camera.y += dy;

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  draw();
});

canvas.addEventListener("mouseup", (e) => {
  isDragging = false;

  // Ak sme len klikli (neťahali), zobrazíme info
  if (!hasMoved && mapData) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const tileSize = mapData.tileSize * camera.zoom;
    const tileX = Math.floor((mouseX - camera.x) / tileSize);
    const tileY = Math.floor((mouseY - camera.y) / tileSize);

    if (tileX >= 0 && tileX < mapData.width && tileY >= 0 && tileY < mapData.height) {
      const tile = mapData.tiles[tileY][tileX];
      infoDiv.textContent = `Políčko [${tileX}, ${tileY}] — Terén: ${tile.terrain} | Výška: ${tile.height}`;
    }
  }
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

// ======================
// Zoom kolieskom myši
// ======================
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const zoomSpeed = 0.1;
  const oldZoom = camera.zoom;

  if (e.deltaY < 0) {
    camera.zoom = Math.min(2.0, camera.zoom + zoomSpeed); // priblíženie
  } else {
    camera.zoom = Math.max(0.15, camera.zoom - zoomSpeed); // oddialenie
  }

  // Zoom smerom k myši (aby to vyzeralo prirodzene)
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = camera.zoom / oldZoom;
  camera.x = mouseX - (mouseX - camera.x) * zoomFactor;
  camera.y = mouseY - (mouseY - camera.y) * zoomFactor;

  draw();
}, { passive: false });

// ======================
// Zmena veľkosti okna
// ======================
window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

// ======================
// Spustenie
// ======================
loadMap();
