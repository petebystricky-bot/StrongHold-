function showError(msg) {
  var info = document.getElementById("info");
  if (info) {
    info.textContent = "CHYBA: " + msg;
    info.style.color = "#f87171";
  }
  var canvas = document.getElementById("detailCanvas");
  if (canvas) {
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 50;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f87171";
    ctx.font = "16px Arial";
    ctx.fillText(msg, 20, 40);
  }
}

function heightToColor(height, shade) {
  shade = shade || 1;
  var t = Math.max(0, Math.min(1, height / 1500));
  var r, g, b;

  if (t < 0.2) {
    var k = t / 0.2;
    r = 25 + k * 35; g = 70 + k * 60; b = 130 + k * 40;
  } else if (t < 0.45) {
    var k = (t - 0.2) / 0.25;
    r = 60 + k * 50; g = 140 + k * 30; b = 70 - k * 20;
  } else if (t < 0.7) {
    var k = (t - 0.45) / 0.25;
    r = 130 + k * 40; g = 110 - k * 25; b = 65 - k * 15;
  } else {
    var k = (t - 0.7) / 0.3;
    r = 170 + k * 85; g = 165 + k * 90; b = 160 + k * 95;
  }

  r = Math.min(255, Math.max(0, r * shade));
  g = Math.min(255, Math.max(0, g * shade));
  b = Math.min(255, Math.max(0, b * shade));
  return [r|0, g|0, b|0];
}

var heightData = null;
var srcW = 0, srcH = 0;
var terrainCanvas = null;
var terrainCtx = null;

var detailCanvas = document.getElementById("detailCanvas");
var overviewCanvas = document.getElementById("overviewCanvas");
var detailCtx = detailCanvas ? detailCanvas.getContext("2d") : null;
var overviewCtx = overviewCanvas ? overviewCanvas.getContext("2d") : null;
var infoDiv = document.getElementById("info");
var minimapContainer = document.getElementById("minimap-container");
var minimapSlider = document.getElementById("minimapSlider");

// 32× jemnejšia textúra
var TEX_SCALE = 32;

var viewX = 0;
var viewY = 0;
var viewZoom = 1;

var isDragging = false;
var lastX = 0, lastY = 0;
var dragTarget = null;
var dragStartX = 0, dragStartY = 0;

function loadHeightmap() {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
      try {
        var c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var data = ctx.getImageData(0, 0, img.width, img.height).data;
        var heights = [];
        for (var y = 0; y < img.height; y++) {
          var row = [];
          for (var x = 0; x < img.width; x++) {
            var i = (y * img.width + x) * 4;
            row.push((data[i] / 255) * 1500);
          }
          heights.push(row);
        }
        srcW = img.width;
        srcH = img.height;
        resolve(heights);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = function() {
      reject(new Error("Nepodarilo sa načítať data/heightmap.png"));
    };
    img.src = "data/heightmap.png?" + Date.now();
  });
}

function sampleH(x, y) {
  x = Math.max(0, Math.min(srcW - 1.001, x));
  y = Math.max(0, Math.min(srcH - 1.001, y));
  var x0 = Math.floor(x), y0 = Math.floor(y);
  var x1 = Math.min(x0 + 1, srcW - 1);
  var y1 = Math.min(y0 + 1, srcH - 1);
  var fx = x - x0, fy = y - y0;
  var h00 = heightData[y0][x0], h10 = heightData[y0][x1];
  var h01 = heightData[y1][x0], h11 = heightData[y1][x1];
  return (h00*(1-fx)+h10*fx)*(1-fy) + (h01*(1-fx)+h11*fx)*fy;
}

function sampleShade(x, y) {
  var hL = sampleH(x - 0.6, y);
  var hR = sampleH(x + 0.6, y);
  var hD = sampleH(x, y - 0.6);
  var hU = sampleH(x, y + 0.6);
  var nx = hL - hR;
  var ny = hD - hU;
  var nz = 3.0;
  var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= len; ny /= len; nz /= len;
  var dot = nx*(-0.45) + ny*(-0.5) + nz*0.75;
  return 0.5 + Math.max(0, dot) * 0.65;
}

function buildTerrainTexture() {
  var tw = srcW * TEX_SCALE;
  var th = srcH * TEX_SCALE;

  terrainCanvas = document.createElement("canvas");
  terrainCanvas.width = tw;
  terrainCanvas.height = th;
  terrainCtx = terrainCanvas.getContext("2d");

  var imgData = terrainCtx.createImageData(tw, th);
  var data = imgData.data;

  for (var py = 0; py < th; py++) {
    for (var px = 0; px < tw; px++) {
      var hx = px / TEX_SCALE;
      var hy = py / TEX_SCALE;
      var height = sampleH(hx, hy);
      var shade = sampleShade(hx, hy);
      var col = heightToColor(height, shade);
      var i = (py * tw + px) * 4;
      data[i] = col[0];
      data[i+1] = col[1];
      data[i+2] = col[2];
      data[i+3] = 255;
    }
  }
  terrainCtx.putImageData(imgData, 0, 0);
}

function updateCanvasSizes() {
  if (!detailCanvas) return;
  var bar = document.getElementById("bottom-bar");
  var barHeight = bar ? bar.offsetHeight : 48;
  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + 6) + "px";
  }
  updateMinimapSize();
  clampView();
}

function updateMinimapSize() {
  if (!minimapSlider || !overviewCanvas) return;
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
  if (!terrainCanvas) return;
  var visW = detailCanvas.width / viewZoom;
  var visH = detailCanvas.height / viewZoom;
  viewX = Math.max(0, Math.min(terrainCanvas.width - visW, viewX));
  viewY = Math.max(0, Math.min(terrainCanvas.height - visH, viewY));
}

function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!terrainCanvas || !detailCtx) return;
  var w = detailCanvas.width;
  var h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);

  var visW = w / viewZoom;
  var visH = h / viewZoom;

  detailCtx.imageSmoothingEnabled = true;
  detailCtx.imageSmoothingQuality = "high";

  detailCtx.drawImage(
    terrainCanvas,
    viewX, viewY, visW, visH,
    0, 0, w, h
  );
}

function drawOverview() {
  if (!terrainCanvas || !overviewCtx) return;
  var w = overviewCanvas.width;
  var h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);

  overviewCtx.imageSmoothingEnabled = true;
  overviewCtx.drawImage(terrainCanvas, 0, 0, w, h);

  var scaleX = w / terrainCanvas.width;
  var scaleY = h / terrainCanvas.height;
  var visW = detailCanvas.width / viewZoom;
  var visH = detailCanvas.height / viewZoom;

  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    viewX * scaleX,
    viewY * scaleY,
    visW * scaleX,
    visH * scaleY
  );
}

function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx; lastY = cy;
  dragStartX = cx; dragStartY = cy;
  dragTarget = target;
}

function moveDrag(cx, cy) {
  if (!isDragging || !terrainCanvas) return;
  var dx = cx - lastX;
  var dy = cy - lastY;

  if (dragTarget === "detail") {
    viewX -= dx / viewZoom;
    viewY -= dy / viewZoom;
  } else {
    var scaleX = overviewCanvas.width / terrainCanvas.width;
    var scaleY = overviewCanvas.height / terrainCanvas.height;
    viewX -= dx / scaleX;
    viewY -= dy / scaleY;
  }

  clampView();
  lastX = cx; lastY = cy;
  drawAll();
}

function endDrag(cx, cy) {
  if (dragTarget === "overview" && cx != null && Math.hypot(cx - dragStartX, cy - dragStartY) < 6) {
    handleMinimapClick(cx, cy);
  }
  isDragging = false;
  dragTarget = null;
}

function handleMinimapClick(cx, cy) {
  if (!terrainCanvas) return;
  var rect = overviewCanvas.getBoundingClientRect();
  var mx = cx - rect.left;
  var my = cy - rect.top;
  var scaleX = overviewCanvas.width / terrainCanvas.width;
  var scaleY = overviewCanvas.height / terrainCanvas.height;

  var visW = detailCanvas.width / viewZoom;
  var visH = detailCanvas.height / viewZoom;
  viewX = mx / scaleX - visW / 2;
  viewY = my / scaleY - visH / 2;
  clampView();
  drawAll();
}

if (detailCanvas) {
  detailCanvas.addEventListener("mousedown", function(e) { e.preventDefault(); startDrag(e.clientX, e.clientY, "detail"); });
  detailCanvas.addEventListener("mousemove", function(e) { moveDrag(e.clientX, e.clientY); });
  detailCanvas.addEventListener("mouseup", function(e) { endDrag(e.clientX, e.clientY); });
  detailCanvas.addEventListener("mouseleave", function() { endDrag(); });
  detailCanvas.addEventListener("touchstart", function(e) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail"); }, {passive:false});
  detailCanvas.addEventListener("touchmove", function(e) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  detailCanvas.addEventListener("touchend", function(e) { endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY); });
}
if (overviewCanvas) {
  overviewCanvas.addEventListener("mousedown", function(e) { e.preventDefault(); startDrag(e.clientX, e.clientY, "overview"); });
  overviewCanvas.addEventListener("mousemove", function(e) { moveDrag(e.clientX, e.clientY); });
  overviewCanvas.addEventListener("mouseup", function(e) { endDrag(e.clientX, e.clientY); });
  overviewCanvas.addEventListener("mouseleave", function() { endDrag(); });
  overviewCanvas.addEventListener("touchstart", function(e) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview"); }, {passive:false});
  overviewCanvas.addEventListener("touchmove", function(e) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  overviewCanvas.addEventListener("touchend", function(e) { endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY); });
}
if (minimapSlider) {
  minimapSlider.addEventListener("input", function() { updateMinimapSize(); drawAll(); });
}
window.addEventListener("resize", function() { updateCanvasSizes(); drawAll(); });

function init() {
  if (!detailCanvas) {
    showError("Chyba: chyba element #detailCanvas");
    return;
  }
  if (infoDiv) infoDiv.textContent = "Generujem texturu terenu (moze chvilu trvat)...";

  loadHeightmap().then(function(heights) {
    heightData = heights;
    buildTerrainTexture();

    if (infoDiv) {
      infoDiv.textContent = "Textura " + terrainCanvas.width + "x" + terrainCanvas.height + " | Plynuly teren";
      infoDiv.style.color = "#bbb";
    }

    if (minimapSlider) minimapSlider.value = 72;
    updateCanvasSizes();

    // Mapa vyplni celu sirku obrazovky
    viewZoom = detailCanvas.width / terrainCanvas.width;
    viewX = 0;
    viewY = Math.max(0, (terrainCanvas.height - detailCanvas.height / viewZoom) / 2);
    clampView();
    drawAll();
  }).catch(function(err) {
    showError(err.message || String(err));
  });
}

init();
