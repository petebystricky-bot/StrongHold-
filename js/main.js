// ======================
// Farby podľa výšky (0–1500 m)
// ======================
function heightToColor(height) {
  const t = Math.max(0, Math.min(1, height / 1500));

  if (t < 0.2) {
    const k = t / 0.2;
    return `rgb(${20 + k * 30}, ${60 + k * 70}, ${120 + k * 60})`;
  } else if (t < 0.45) {
    const k = (t - 0.2) / 0.25;
    return `rgb(${50 + k * 50}, ${130 + k * 40}, ${60 - k * 20})`;
  } else if (t < 0.7) {
    const k = (t - 0.45) / 0.25;
    return `rgb(${120 + k * 40}, ${100 - k * 20}, ${60 - k * 20})`;
  } else {
    const k = (t - 0.7) / 0.3;
    return `rgb(${160 + k * 95}, ${150 + k * 105}, ${140 + k * 115})`;
  }
}

// ======================
// Premenné
// ======================
let heightData = null;       // pôvodná 36 × 64
let srcWidth = 36;
let srcHeight = 64;

// Pri vykresľovaní používame 4× jemnejšiu mriežku
const SCALE = 4;
let mapWidth = srcWidth * SCALE;   // 72
let mapHeight = srcHeight * SCALE; // 128

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas.getContext("2d");
const overviewCtx = overviewCanvas.getContext("2d");
const infoDiv = document.getElementById("info");
const minimapContainer = document.getElementById("minimap-container");
const minimapSlider = document.getElementById("minimapSlider");

let viewWidth = 24;
let viewHeight = 32;
let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null;
let dragStartX = 0;
let dragStartY = 0;

// ======================
// Bilineárna interpolácia výšky
// ======================
function getInterpolatedHeight(x, y) {
  // x, y sú v súradniciach jemnej mriežky (0 .. mapWidth)
  // Prevedieme na súradnice pôvodnej heightmapy
  const srcX = x / SCALE;
  const srcY = y / SCALE;

  const x0 = Math.floor(srcX);
  const y0 = Math.floor(srcY);
  const x1 = Math.min(x0 + 1, srcWidth - 1);
  const y1 = Math.min(y0 + 1, srcHeight - 1);

  const fx = srcX - x0;
  const fy = srcY - y0;

  const h00 = heightData[y0][x0];
  const h10 = heightData[y0][x1];
  const h01 = heightData[y1][x0];
  const h11 = heightData[y1][x1];

  // Bilineárna interpolácia
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fy) + h1 * fy;
}

// ======================
// Načítanie heightmapy
// ======================
function loadHeightmap() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      const heights = [];
      for (let y = 0; y < img.height; y++) {
        const row = [];
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const brightness = data[i];
          const height = (brightness / 255) * 1500;
          row.push(height);
        }
        heights.push(row);
      }

      srcWidth = img.width;
      srcHeight = img.height;
      mapWidth = srcWidth * SCALE;
      mapHeight = srcHeight * SCALE;

      resolve(heights);
    };

    img.onerror = () => reject(new Error("Nepodarilo sa načítať data/heightmap.png"));
    img.src = "data/heightmap.png";
  });
}

// ======================
// Počet viditeľných dielikov
// ======================
function calculateViewSize() {
  const w = detailCanvas.width;
  const h = detailCanvas.height;
  const aspect = w / h;

  // Pri SCALE = 4 chceme vidieť približne toľko „logických“ sub-tiles ako predtým
  let cols = 48;
  let rows = 64;

  if (aspect >= 1) {
    rows = 48;
    cols = Math.max(48, Math.round(rows * aspect));
  } else {
    cols = 48;
    rows = Math.max(48, Math.round(cols / aspect));
  }

  cols = Math.min(cols, mapWidth);
  rows = Math.min(rows, mapHeight);

  viewWidth = cols;
  viewHeight = rows;
}

// ======================
// Minimap veľkosť
// ======================
function updateMinimapSize() {
  const value = Number(minimapSlider.value);
  const inverted = 100 - value;

  const minSize = 50;
  const maxSize = Math.floor(window.innerWidth * 0.48);
  const size = Math.floor(minSize + (maxSize - minSize) * (inverted / 100));

  overviewCanvas.width = size;
  overviewCanvas.height = size;

  if (value >= 98) {
    minimapContainer.classList.add("hidden");
  } else {
    minimapContainer.classList.remove("hidden");
  }
}

// ======================
// Canvas sizes
// ======================
function updateCanvasSizes() {
  const bar = document.getElementById("bottom-bar");
  const barHeight = bar ? bar.offsetHeight : 48;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  const gap = 6;
  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + gap) + "px";
  }

  calculateViewSize();
  updateMinimapSize();
  clampView();
}

function clampView() {
  viewX = Math.max(0, Math.min(mapWidth - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapHeight - viewHeight, viewY));
}

// ======================
// Načítanie
// ======================
async function loadAll() {
  try {
    heightData = await loadHeightmap();

    minimapSlider.value = 72;
    updateCanvasSizes();

    viewX = (mapWidth - viewWidth) / 2;
    viewY = (mapHeight - viewHeight) / 2;
    clampView();
    drawAll();

    if (infoDiv) infoDiv.textContent = `Plynulý terén \( {mapWidth}× \){mapHeight} (interpolácia)`;
  } catch (err) {
    console.error(err);
    if (infoDiv) infoDiv.textContent = "Chyba pri načítaní heightmapy";
  }
}

// ======================
// Vykreslenie
// ======================
function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!heightData) return;

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

      if (mapX < 0 || mapX >= mapWidth || mapY < 0 || mapY >= mapHeight) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);
        continue;
      }

      const height = getInterpolatedHeight(mapX, mapY);
      detailCtx.fillStyle = heightToColor(height);
      detailCtx.fillRect(screenX, screenY, tileW + 1, tileH + 1);
    }
  }
}

function drawOverview() {
  if (!heightData) return;

  const w = overviewCanvas.width;
  const h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  // Na minimape kreslíme pôvodné rozlíšenie (rýchlejšie)
  const scaleX = w / srcWidth;
  const scaleY = h / srcHeight;

  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const height = heightData[y][x];
      overviewCtx.fillStyle = heightToColor(height);
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  // Zelený rámček (prepočítaný na pôvodné súradnice)
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    (viewX / SCALE) * scaleX,
    (viewY / SCALE) * scaleY,
    (viewWidth / SCALE) * scaleX,
    (viewHeight / SCALE) * scaleY
  );
}

// ======================
// Ovládanie
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
  if (!isDragging || !heightData) return;

  const dx = clientX - lastX;
  const dy = clientY - lastY;

  if (dragTarget === "detail") {
    const tileW = detailCanvas.width / viewWidth;
    const tileH = detailCanvas.height / viewHeight;
    viewX -= dx / tileW;
    viewY -= dy / tileH;
  } else if (dragTarget === "overview") {
    const scaleX = overviewCanvas.width / srcWidth;
    const scaleY = overviewCanvas.height / srcHeight;
    viewX -= (dx / scaleX) * SCALE;
    viewY -= (dy / scaleY) * SCALE;
  }

  clampView();
  lastX = clientX;
  lastY = clientY;
  drawAll();
}

function endDrag(clientX, clientY) {
  if (dragTarget === "overview" && clientX !== undefined) {
    const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
    if (dist < 6) handleMinimapClick(clientX, clientY);
  }
  isDragging = false;
  dragTarget = null;
}

function handleMinimapClick(clientX, clientY) {
  if (!heightData) return;

  const rect = overviewCanvas.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const scaleX = overviewCanvas.width / srcWidth;
  const scaleY = overviewCanvas.height / srcHeight;

  viewX = (mouseX / scaleX) * SCALE - viewWidth / 2;
  viewY = (mouseY / scaleY) * SCALE - viewHeight / 2;

  clampView();
  drawAll();
}

// Udalosti
detailCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "detail"); });
detailCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
detailCanvas.addEventListener("mouseleave", () => endDrag());

detailCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail"); }, { passive: false });
detailCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
detailCanvas.addEventListener("touchend", e => { if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

overviewCanvas.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "overview"); });
overviewCanvas.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseup", e => endDrag(e.clientX, e.clientY));
overviewCanvas.addEventListener("mouseleave", () => endDrag());

overviewCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview"); }, { passive: false });
overviewCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
overviewCanvas.addEventListener("touchend", e => { if (e.changedTouches.length) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); else endDrag(); });

minimapSlider.addEventListener("input", () => { updateMinimapSize(); drawAll(); });
window.addEventListener("resize", () => { updateCanvasSizes(); drawAll(); });

// Spustenie
loadAll();
