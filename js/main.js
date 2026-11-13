// ======================
// Jednoduchá zelená mapa + minimapa
// ======================

var detailCanvas = document.getElementById("detailCanvas");
var overviewCanvas = document.getElementById("overviewCanvas");
var detailCtx = detailCanvas.getContext("2d");
var overviewCtx = overviewCanvas.getContext("2d");
var infoDiv = document.getElementById("info");
var minimapContainer = document.getElementById("minimap-container");
var minimapSlider = document.getElementById("minimapSlider");

// Veľkosť mapy v políčkach
var mapWidth = 12;
var mapHeight = 16;

// Koľko políčok vidíme naraz
var viewWidth = 6;
var viewHeight = 8;
var viewX = 0;
var viewY = 0;

var isDragging = false;
var lastX = 0, lastY = 0;
var dragTarget = null;
var dragStartX = 0, dragStartY = 0;

// Jedna zelená farba (čisté štvorce)
var TILE_COLOR = "#3d8c40";
var TILE_BORDER = "rgba(0,0,0,0.25)";
var EMPTY_COLOR = "#111";

function updateCanvasSizes() {
  var bar = document.getElementById("bottom-bar");
  var barHeight = bar ? bar.offsetHeight : 48;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + 6) + "px";
  }

  // Počet viditeľných políčok podľa pomeru strán
  var aspect = detailCanvas.width / detailCanvas.height;
  if (aspect >= 1) {
    viewHeight = 8;
    viewWidth = Math.max(6, Math.round(viewHeight * aspect));
  } else {
    viewWidth = 6;
    viewHeight = Math.max(8, Math.round(viewWidth / aspect));
  }
  viewWidth = Math.min(viewWidth, mapWidth);
  viewHeight = Math.min(viewHeight, mapHeight);

  updateMinimapSize();
  clampView();
}

function updateMinimapSize() {
  if (!minimapSlider) return;
  var value = Number(minimapSlider.value);
  var inverted = 100 - value;
  var size = Math.floor(50 + (window.innerWidth * 0.48 - 50) * (inverted / 100));
  overviewCanvas.width = size;
  overviewCanvas.height = size;

  if (minimapContainer) {
    if (value >= 98) minimapContainer.classList.add("hidden");
    else minimapContainer.classList.remove("hidden");
  }
}

function clampView() {
  viewX = Math.max(0, Math.min(mapWidth - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mapHeight - viewHeight, viewY));
}

function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  var w = detailCanvas.width;
  var h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);

  var tileW = w / viewWidth;
  var tileH = h / viewHeight;

  var startX = Math.floor(viewX);
  var startY = Math.floor(viewY);
  var offX = (viewX - startX) * tileW;
  var offY = (viewY - startY) * tileH;

  for (var y = 0; y <= viewHeight; y++) {
    for (var x = 0; x <= viewWidth; x++) {
      var mx = startX + x;
      var my = startY + y;
      var sx = x * tileW - offX;
      var sy = y * tileH - offY;

      if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) {
        detailCtx.fillStyle = EMPTY_COLOR;
        detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);
        continue;
      }

      detailCtx.fillStyle = TILE_COLOR;
      detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);

      detailCtx.strokeStyle = TILE_BORDER;
      detailCtx.strokeRect(sx, sy, tileW, tileH);
    }
  }
}

function drawOverview() {
  var w = overviewCanvas.width;
  var h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  var scaleX = w / mapWidth;
  var scaleY = h / mapHeight;

  for (var y = 0; y < mapHeight; y++) {
    for (var x = 0; x < mapWidth; x++) {
      overviewCtx.fillStyle = TILE_COLOR;
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  // Zelený rámček – aktuálny pohľad
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    viewX * scaleX,
    viewY * scaleY,
    viewWidth * scaleX,
    viewHeight * scaleY
  );
}

function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx;
  lastY = cy;
  dragStartX = cx;
  dragStartY = cy;
  dragTarget = target;
}

function moveDrag(cx, cy) {
  if (!isDragging) return;
  var dx = cx - lastX;
  var dy = cy - lastY;

  if (dragTarget === "detail") {
    var tileW = detailCanvas.width / viewWidth;
    var tileH = detailCanvas.height / viewHeight;
    viewX -= dx / tileW;
    viewY -= dy / tileH;
  } else if (dragTarget === "overview") {
    var scaleX = overviewCanvas.width / mapWidth;
    var scaleY = overviewCanvas.height / mapHeight;
    viewX -= dx / scaleX;
    viewY -= dy / scaleY;
  }

  clampView();
  lastX = cx;
  lastY = cy;
  drawAll();
}

function endDrag(cx, cy) {
  if (dragTarget === "overview" && cx != null) {
    if (Math.hypot(cx - dragStartX, cy - dragStartY) < 6) {
      handleMinimapClick(cx, cy);
    }
  }
  isDragging = false;
  dragTarget = null;
}

function handleMinimapClick(cx, cy) {
  var rect = overviewCanvas.getBoundingClientRect();
  var mx = cx - rect.left;
  var my = cy - rect.top;
  var scaleX = overviewCanvas.width / mapWidth;
  var scaleY = overviewCanvas.height / mapHeight;

  viewX = mx / scaleX - viewWidth / 2;
  viewY = my / scaleY - viewHeight / 2;
  clampView();
  drawAll();
}

// Udalosti
detailCanvas.addEventListener("mousedown", function(e) {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});
detailCanvas.addEventListener("mousemove", function(e) { moveDrag(e.clientX, e.clientY); });
detailCanvas.addEventListener("mouseup", function(e) { endDrag(e.clientX, e.clientY); });
detailCanvas.addEventListener("mouseleave", function() { endDrag(); });

detailCanvas.addEventListener("touchstart", function(e) {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail");
}, { passive: false });
detailCanvas.addEventListener("touchmove", function(e) {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
detailCanvas.addEventListener("touchend", function(e) {
  endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY);
});

overviewCanvas.addEventListener("mousedown", function(e) {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", function(e) { moveDrag(e.clientX, e.clientY); });
overviewCanvas.addEventListener("mouseup", function(e) { endDrag(e.clientX, e.clientY); });
overviewCanvas.addEventListener("mouseleave", function() { endDrag(); });

overviewCanvas.addEventListener("touchstart", function(e) {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", function(e) {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", function(e) {
  endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY);
});

if (minimapSlider) {
  minimapSlider.addEventListener("input", function() {
    updateMinimapSize();
    drawAll();
  });
}

window.addEventListener("resize", function() {
  updateCanvasSizes();
  drawAll();
});

// Štart
function init() {
  if (minimapSlider) minimapSlider.value = 72;
  updateCanvasSizes();
  viewX = (mapWidth - viewWidth) / 2;
  viewY = (mapHeight - viewHeight) / 2;
  clampView();
  drawAll();
  if (infoDiv) {
    infoDiv.textContent = "Zaklad: zelene stvorce 12x16 | Minimap + ovladanie";
    infoDiv.style.color = "#bbb";
  }
}

init();
