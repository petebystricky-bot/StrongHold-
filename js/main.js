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

function hash(n) {
  n = (n << 13) ^ n;
  return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  var x0 = Math.floor(x);
  var y0 = Math.floor(y);
  var fx = x - x0;
  var fy = y - y0;
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

function fbm(x, y, octaves) {
  var value = 0, amplitude = 0.5, frequency = 1, max = 0;
  for (var i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency);
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / max;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function heightToColor(height, shade, colorNoise) {
  shade = shade || 1;
  colorNoise = colorNoise || 0;
  var r, g, b;

  if (height < 220) {
    var t = Math.max(0, Math.min(1, height / 220));
    r = lerp(18, 45, t);
    g = lerp(55, 100, t);
    b = lerp(120, 70, t);
  } else {
    var t = Math.max(0, Math.min(1, (height - 220) / 1280));
    if (t < 0.4) {
      var k = t / 0.4;
      r = lerp(40, 75, k);
      g = lerp(95, 150, k);
      b = lerp(45, 55, k);
    } else if (t < 0.75) {
      var k = (t - 0.4) / 0.35;
      r = lerp(75, 130, k);
      g = lerp(150, 165, k);
      b = lerp(55, 50, k);
    } else {
      var k = (t - 0.75) / 0.25;
      r = lerp(130, 175, k);
      g = lerp(165, 185, k);
      b = lerp(50, 75, k);
    }
    r += colorNoise * 16;
    g += colorNoise * 12;
    b += colorNoise * 6;
  }

  r = Math.min(255, Math.max(0, r * shade));
  g = Math.min(255, Math.max(0, g * shade));
  b = Math.min(255, Math.max(0, b * shade));
  return [r | 0, g | 0, b | 0];
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

var TEX_SCALE = 32;
var HEIGHT_NOISE_STRENGTH = 28;
var HEIGHT_NOISE_SCALE = 0.18;
var COLOR_NOISE_STRENGTH = 0.10;

// Termálna erózia – len spodná polovica
var THERMAL_ITERATIONS = 20;
var THERMAL_TALUS = 0.028;
var THERMAL_RATE = 0.35;

// Hydraulická sedimentácia – horná polovica
var HYDRO_ITERATIONS = 25;
var HYDRO_DEPOSIT = 0.45;   // koľko materiálu sa usadí
var HYDRO_EROSION = 0.18;   // koľko sa odoberie na svahu

var viewX = 0, viewY = 0, viewZoom = 1;
var isDragging = false, lastX = 0, lastY = 0, dragTarget = null, dragStartX = 0, dragStartY = 0;

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

// ======================
// Termálna erózia – LEN spodná polovica
// ======================
function applyThermalErosionBottom(heights, iterations) {
  var w = heights[0].length;
  var h = heights.length;
  var midY = Math.floor(h / 2);
  var maxDiff = THERMAL_TALUS * 1500;

  for (var iter = 0; iter < iterations; iter++) {
    var next = [];
    for (var y = 0; y < h; y++) next[y] = heights[y].slice();

    for (var y = Math.max(1, midY); y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var h0 = heights[y][x];
        var neighbors = [
          [x+1,y],[x-1,y],[x,y+1],[x,y-1],
          [x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]
        ];
        var totalMove = 0;
        var moves = [];

        for (var n = 0; n < neighbors.length; n++) {
          var nx = neighbors[n][0], ny = neighbors[n][1];
          if (ny < midY) continue; // nepresúvame do hornej polovice
          var diff = h0 - heights[ny][nx];
          if (diff > maxDiff) {
            var amount = (diff - maxDiff) * THERMAL_RATE;
            moves.push({ x: nx, y: ny, amount: amount });
            totalMove += amount;
          }
        }

        if (totalMove > 0) {
          var scale = Math.min(1, (h0 * 0.15) / totalMove);
          next[y][x] -= totalMove * scale;
          for (var m = 0; m < moves.length; m++) {
            next[moves[m].y][moves[m].x] += moves[m].amount * scale;
          }
        }
      }
    }
    heights = next;
  }
  return heights;
}

// ======================
// Hydraulická sedimentácia – LEN horná polovica
// Jednoduchý model: voda tečie dole, na svahu eroduje, v priehlbinách usádza
// ======================
function applyHydraulicSedimentationTop(heights, iterations) {
  var w = heights[0].length;
  var h = heights.length;
  var midY = Math.floor(h / 2);

  for (var iter = 0; iter < iterations; iter++) {
    var next = [];
    for (var y = 0; y < h; y++) next[y] = heights[y].slice();

    for (var y = 1; y < midY; y++) {
      for (var x = 1; x < w - 1; x++) {
        var h0 = heights[y][x];

        // Nájdi najnižšieho suseda (smer toku)
        var minH = h0;
        var minX = x, minY = y;
        var neighbors = [
          [x+1,y],[x-1,y],[x,y+1],[x,y-1],
          [x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]
        ];

        for (var n = 0; n < neighbors.length; n++) {
          var nx = neighbors[n][0], ny = neighbors[n][1];
          if (ny >= midY) continue;
          if (heights[ny][nx] < minH) {
            minH = heights[ny][nx];
            minX = nx;
            minY = ny;
          }
        }

        var diff = h0 - minH;
        if (diff > 5) {
          // Erozia na tomto bode + sedimentácia u suseda
          var erode = Math.min(diff * HYDRO_EROSION, h0 * 0.08);
          var deposit = erode * HYDRO_DEPOSIT;

          next[y][x] -= erode;
          next[minY][minX] += deposit;
        }
      }
    }
    heights = next;
  }
  return heights;
}

function processTerrain(heights) {
  // 1. Termálna erózia – spodná polovica (20 iterácií)
  heights = applyThermalErosionBottom(heights, THERMAL_ITERATIONS);
  // 2. Hydraulická sedimentácia – horná polovica
  heights = applyHydraulicSedimentationTop(heights, HYDRO_ITERATIONS);
  return heights;
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
  var base = (h00*(1-fx)+h10*fx)*(1-fy) + (h01*(1-fx)+h11*fx)*fy;
  var n = fbm(x * HEIGHT_NOISE_SCALE, y * HEIGHT_NOISE_SCALE, 4);
  return base + (n - 0.5) * 2 * HEIGHT_NOISE_STRENGTH;
}

function sampleShade(x, y) {
  var hL = sampleH(x - 0.7, y);
  var hR = sampleH(x + 0.7, y);
  var hD = sampleH(x, y - 0.7);
  var hU = sampleH(x, y + 0.7);
  var nx = hL - hR, ny = hD - hU, nz = 2.8;
  var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= len; ny /= len; nz /= len;
  var dot = nx*(-0.4) + ny*(-0.55) + nz*0.75;
  var shade = 0.48 + Math.max(0, dot) * 0.7;
  if (Math.sqrt(nx*nx + ny*ny) < 0.15) shade *= 0.92;
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
      var cn = (fbm(hx * 0.35 + 20, hy * 0.35 + 10, 3) - 0.5) * 2 * COLOR_NOISE_STRENGTH;
      var col = heightToColor(height, shade, cn);
      var i = (py * tw + px) * 4;
      data[i] = col[0]; data[i+1] = col[1]; data[i+2] = col[2]; data[i+3] = 255;
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
  if (minimapContainer) minimapContainer.style.bottom = (barHeight + 6) + "px";
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
  var w = detailCanvas.width, h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);
  var visW = w / viewZoom, visH = h / viewZoom;
  detailCtx.imageSmoothingEnabled = true;
  detailCtx.imageSmoothingQuality = "high";
  detailCtx.drawImage(terrainCanvas, viewX, viewY, visW, visH, 0, 0, w, h);
}

function drawOverview() {
  if (!terrainCanvas || !overviewCtx) return;
  var w = overviewCanvas.width, h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);
  overviewCtx.imageSmoothingEnabled = true;
  overviewCtx.drawImage(terrainCanvas, 0, 0, w, h);
  var scaleX = w / terrainCanvas.width, scaleY = h / terrainCanvas.height;
  var visW = detailCanvas.width / viewZoom, visH = detailCanvas.height / viewZoom;
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(viewX * scaleX, viewY * scaleY, visW * scaleX, visH * scaleY);
}

function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx; lastY = cy;
  dragStartX = cx; dragStartY = cy;
  dragTarget = target;
}
function moveDrag(cx, cy) {
  if (!isDragging || !terrainCanvas) return;
  var dx = cx - lastX, dy = cy - lastY;
  if (dragTarget === "detail") {
    viewX -= dx / viewZoom;
    viewY -= dy / viewZoom;
  } else {
    var sx = overviewCanvas.width / terrainCanvas.width;
    var sy = overviewCanvas.height / terrainCanvas.height;
    viewX -= dx / sx;
    viewY -= dy / sy;
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
  var mx = cx - rect.left, my = cy - rect.top;
  var sx = overviewCanvas.width / terrainCanvas.width;
  var sy = overviewCanvas.height / terrainCanvas.height;
  var visW = detailCanvas.width / viewZoom, visH = detailCanvas.height / viewZoom;
  viewX = mx / sx - visW / 2;
  viewY = my / sy - visH / 2;
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
if (minimapSlider) minimapSlider.addEventListener("input", function() { updateMinimapSize(); drawAll(); });
window.addEventListener("resize", function() { updateCanvasSizes(); drawAll(); });

function init() {
  if (!detailCanvas) {
    showError("Chyba: chyba element #detailCanvas");
    return;
  }
  if (infoDiv) infoDiv.textContent = "Nacitam heightmapu...";

  loadHeightmap().then(function(heights) {
    if (infoDiv) infoDiv.textContent = "Termalna erozia (spodok) + hydraulicka sedimentacia (vrch)...";
    heightData = processTerrain(heights);

    if (infoDiv) infoDiv.textContent = "Generujem texturu...";
    buildTerrainTexture();

    if (infoDiv) {
      infoDiv.textContent = "Textura " + terrainCanvas.width + "x" + terrainCanvas.height + " | Regionalna erozia";
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
