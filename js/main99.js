// ======================
// Nastavenie farieb terénu
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

// ======================
// Načítanie mapy
// ======================
async function loadMap() {
  try {
    const response = await fetch("data/mapa.json");
    mapData = await response.json();

    // Nastavíme veľkosť canvasu podľa mapy
    canvas.width = mapData.width * mapData.tileSize;
    canvas.height = mapData.height * mapData.tileSize;

    drawMap();
    console.log("Mapa úspešne načítaná!");
  } catch (error) {
    console.error("Chyba pri načítaní mapy:", error);
    infoDiv.textContent = "Chyba: Nepodarilo sa načítať mapu. Skontroluj cestu k súboru.";
  }
}

// ======================
// Vykreslenie mapy
// ======================
function drawMap() {
  if (!mapData) return;

  const tileSize = mapData.tileSize;

  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      const color = TERRAIN_COLORS[tile.terrain] || "#ff00ff"; // ružová = neznámy terén

      // Vyplníme dlaždicu farbou
      ctx.fillStyle = color;
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

      // Jemná mriežka (voliteľné)
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}

// ======================
// Kliknutie na mapu
// ======================
canvas.addEventListener("click", (e) => {
  if (!mapData) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const tileX = Math.floor(mouseX / mapData.tileSize);
  const tileY = Math.floor(mouseY / mapData.tileSize);

  // Kontrola, či sme klikli dovnútra mapy
  if (tileX >= 0 && tileX < mapData.width && tileY >= 0 && tileY < mapData.height) {
    const tile = mapData.tiles[tileY][tileX];
    infoDiv.textContent = `Políčko [${tileX}, ${tileY}] — Terén: ${tile.terrain} | Výška: ${tile.height}`;
  }
});

// ======================
// Spustenie
// ======================
loadMap();
