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

// ======================
// Jednoduchý value noise
// ======================
function hash(n) {
  n = (n << 13) ^ n;
  return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  var x0 = Math.floor(x);
  var y0 = Math.floor(y);
  var fx = x - x0;
  var fy = y - y0;
  // jemné vyhladenie
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);

  var n00 = hash(x0 + y0 * 57);
  var n10 = hash(x0 + 1 + y0 * 57);
  var n01 = hash(x0 + (y0 + 1) * 57);
  var n11 = hash(x0 + 1 + (y0 + 1) * 57);

  var nx0 = n00 * (1 - fx) + n10 * fx;
  var nx1 = n01 * (1 - fx) + n11 * fx;
  return nx0 * (1 - fy) + nx1 * fy;
}

// Viacoktávový noise (0..1)
function fbm(x, y, octaves) {
  var value = 0;
  var amplitude = 0.5;
  var frequency = 1;
  var max = 0;
  for (var i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency);
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / max;
}

// ======================
// Farby – iba odtiene zelenej + voda
// ======================
function heightToColor(height, shade, colorNoise) {
  shade = shade || 1;
  colorNoise = colorNoise || 0;

  var r, g, b;

  // Voda / veľmi nízko
  if (height < 180) {
    var k = Math.max(0, height / 180);
    r = 20 + k * 25;
    g = 60 + k * 50;
    b = 110 + k * 50;
  } else {
    // Iba zelená škála podľa výšky
    var t = Math.max(0, Math.min(1, (height - 180) / 1320));

    // tmavozelená (nížina) → stredne zelená → svetlozelená / žltkastá (vyššie)
    if (t < 0.35) {
      var k = t / 0.35;
      r = 30 + k * 40;
      g = 90 + k * 70;
      b = 35 + k * 20;
    } else if (t < 0.7) {
      var k = (t - 0.35) / 0.35;
      r = 70 + k * 50;
      g = 140 + k * 30;
      b = 50 - k * 15;
    } else {
      var k = (t - 0.7) / 0.3;
      r = 120 + k * 60;
      g = 160 + k * 40;
      b = 40 + k * 30;
    }

    // Mierny noise na farby
    r += colorNoise * 18;
    g += colorNoise * 14;
    b += colorNoise * 8;
  }

  r = Math.min(255, Math.max(0, r * shade));
  g = Math.min(255, Math.max(0, g * shade));
  b = Math.min(255, Math.max(0, b * shade));
  return [r | 0, g | 0, b | 0];
}

// ======================
// Premenné
// ======================
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

var TEX_SCALE = 32;

// Noise parametre
var HEIGHT_NOISE_STRENGTH = 32;   // stredná intenzita (± metre)
var HEIGHT_NOISE_SCALE = 0.18;    // frekvencia
var COLOR_NOISE_STRENGTH = 0.12;  // mierny noise na farby

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
      reject(new Error("Nepodarilo sa nacitat data/heightmap.png"));
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
  var base = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;

  // Stredný noise na výšky
  var n = fbm(x * HEIGHT_NOISE_SCALE, y * HEIGHT_NOISE_SCALE, 4);
  var noiseOffset = (n - 0.5) * 2 * HEIGHT_NOISE_STRENGTH;
  return base + noiseOffset;
}

function sampleShade(x, y) {
  var hL = sampleH(x - 0.7, y);
  var hR = sampleH(x + 0.7, y);
  var hD = sampleH(x, y - 0.7);
  var hU = sampleH(x, y + 0.7);

  var nx = hL - hR;
  var ny = hD - hU;
  var nz = 2.8;
  var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len; ny /= len; nz /= len;

  // Hlavné svetlo
  var dot = nx * (-0.4) + ny * (-0.55) + nz * 0.75;
  var shade = 0.48 + Math.max(0, dot) * 0.7;

  // Jemný efekt v údoliach (tmavšie)
  var slope = Math.sqrt(nx * nx + ny * ny);
  if (slope < 0.15) {
    shade *= 0.92;
  }

  return Math.max(0.35, Math.min(1.15, shade));
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

      // Mierny noise na farby (−0.5 .. 0.5)
      var cn = (fbm(hx * 0.35 + 20, hy * 0.35 + 10, 3) - 0.5) * 2 * COLOR_NOISE_STRENGTH;

      var col = heightToColor(height, shade, cn);
      var i = (py * tw + px) * 4;
      data[i] = col[0];
      data[i + 1] = col[1];
      data[i + 2] = col[2];
      data[i + 3] = 255;
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
  if (infoDiv) infoDiv.textContent = "Generujem texturu s noise (moze chvilu trvat)...";

  loadHeightmap().then(function(heights) {
    heightData = heights;
    buildTerrainTexture();

    if (infoDiv) {
      infoDiv.textContent = "Textura " + terrainCanvas.width + "x" + terrainCanvas.height + " | Zelena paleta + noise";
      infoDiv.style.color = "#bbb";
    }

    if (minimapSlider) minimapSlider.value = 72;
    updateCanvasSizes();

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
