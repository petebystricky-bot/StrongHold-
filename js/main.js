function showError(msg) {
  const info = document.getElementById("info");
  if (info) {
    info.textContent = "CHYBA: " + msg;
    info.style.color = "#f87171";
  }
  const canvas = document.getElementById("detailCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
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
  return "rgb(" + (r|0) + "," + (g|0) + "," + (b|0) + ")";
}

var heightData = null;
var mesh = null;

var detailCanvas = document.getElementById("detailCanvas");
var overviewCanvas = document.getElementById("overviewCanvas");
var detailCtx = detailCanvas ? detailCanvas.getContext("2d") : null;
var overviewCtx = overviewCanvas ? overviewCanvas.getContext("2d") : null;
var infoDiv = document.getElementById("info");
var minimapContainer = document.getElementById("minimap-container");
var minimapSlider = document.getElementById("minimapSlider");

var RENDER_SCALE = 4;
var viewWidth = 40;
var viewHeight = 50;
var viewX = 0;
var viewY = 0;

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

function buildMesh(heights) {
  var w = heights[0].length;
  var h = heights.length;
  var positions = new Float32Array(w * h * 3);
  var normals = new Float32Array(w * h * 3);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = heights[y][x];
    }
  }

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 3;
      var hL = heights[y][Math.max(0, x - 1)];
      var hR = heights[y][Math.min(w - 1, x + 1)];
      var hD = heights[Math.max(0, y - 1)][x];
      var hU = heights[Math.min(h - 1, y + 1)][x];
      var nx = hL - hR;
      var ny = hD - hU;
      var nz = 2.5;
      var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return { positions: positions, normals: normals, width: w, height: h };
}

function sampleHeight(x, y) {
  var w = mesh.width, h = mesh.height;
  var x0 = Math.floor(x), y0 = Math.floor(y);
  var x1 = Math.min(x0 + 1, w - 1);
  var y1 = Math.min(y0 + 1, h - 1);
  var fx = x - x0, fy = y - y0;
  var h00 = mesh.positions[(y0 * w + x0) * 3 + 2];
  var h10 = mesh.positions[(y0 * w + x1) * 3 + 2];
  var h01 = mesh.positions[(y1 * w + x0) * 3 + 2];
  var h11 = mesh.positions[(y1 * w + x1) * 3 + 2];
  return (h00*(1-fx) + h10*fx)*(1-fy) + (h01*(1-fx) + h11*fx)*fy;
}

function sampleNormal(x, y) {
  var w = mesh.width, h = mesh.height;
  var x0 = Math.floor(x), y0 = Math.floor(y);
  var x1 = Math.min(x0 + 1, w - 1);
  var y1 = Math.min(y0 + 1, h - 1);
  var fx = x - x0, fy = y - y0;

  function n(ix, iy) {
    var i = (iy * w + ix) * 3;
    return [mesh.normals[i], mesh.normals[i+1], mesh.normals[i+2]];
  }
  var n00 = n(x0,y0), n10 = n(x1,y0), n01 = n(x0,y1), n11 = n(x1,y1);
  var out = [0,0,0];
  for (var k = 0; k < 3; k++) {
    var a = n00[k]*(1-fx) + n10[k]*fx;
    var b = n01[k]*(1-fx) + n11[k]*fx;
    out[k] = a*(1-fy) + b*fy;
  }
  return out;
}

function getShade(normal) {
  var dot = normal[0]*(-0.4) + normal[1]*(-0.5) + normal[2]*0.8;
  return 0.55 + Math.max(0, dot) * 0.6;
}

function calculateViewSize() {
  if (!mesh) return;
  var w = detailCanvas.width, h = detailCanvas.height;
  var aspect = w / h;
  var cols = 40, rows = 50;
  if (aspect >= 1) {
    rows = 40;
    cols = Math.max(40, Math.round(rows * aspect));
  } else {
    cols = 40;
    rows = Math.max(40, Math.round(cols / aspect));
  }
  viewWidth = Math.min(cols, mesh.width * RENDER_SCALE);
  viewHeight = Math.min(rows, mesh.height * RENDER_SCALE);
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

function updateCanvasSizes() {
  if (!detailCanvas) return;
  var bar = document.getElementById("bottom-bar");
  var barHeight = bar ? bar.offsetHeight : 48;
  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;
  if (minimapContainer) minimapContainer.style.bottom = (barHeight + 6) + "px";
  if (mesh) {
    calculateViewSize();
    updateMinimapSize();
    clampView();
  }
}

function clampView() {
  if (!mesh) return;
  viewX = Math.max(0, Math.min(mesh.width * RENDER_SCALE - viewWidth, viewX));
  viewY = Math.max(0, Math.min(mesh.height * RENDER_SCALE - viewHeight, viewY));
}

function drawAll() {
  drawDetail();
  drawOverview();
}

function drawDetail() {
  if (!mesh || !detailCtx) return;
  var w = detailCanvas.width, h = detailCanvas.height;
  detailCtx.clearRect(0, 0, w, h);
  var tileW = w / viewWidth;
  var tileH = h / viewHeight;
  var startX = Math.floor(viewX);
  var startY = Math.floor(viewY);
  var offX = (viewX - startX) * tileW;
  var offY = (viewY - startY) * tileH;

  for (var y = 0; y <= viewHeight; y++) {
    for (var x = 0; x <= viewWidth; x++) {
      var mx = (startX + x) / RENDER_SCALE;
      var my = (startY + y) / RENDER_SCALE;
      var sx = x * tileW - offX;
      var sy = y * tileH - offY;

      if (mx < 0 || mx >= mesh.width - 0.01 || my < 0 || my >= mesh.height - 0.01) {
        detailCtx.fillStyle = "#111";
        detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);
        continue;
      }
      var height = sampleHeight(mx, my);
      var shade = getShade(sampleNormal(mx, my));
      detailCtx.fillStyle = heightToColor(height, shade);
      detailCtx.fillRect(sx, sy, tileW + 1, tileH + 1);
    }
  }
}

function drawOverview() {
  if (!mesh || !overviewCtx) return;
  var w = overviewCanvas.width, h = overviewCanvas.height;
  overviewCtx.clearRect(0, 0, w, h);
  var scaleX = w / mesh.width;
  var scaleY = h / mesh.height;

  for (var y = 0; y < mesh.height; y++) {
    for (var x = 0; x < mesh.width; x++) {
      var i = (y * mesh.width + x) * 3;
      var height = mesh.positions[i + 2];
      var normal = [mesh.normals[i], mesh.normals[i+1], mesh.normals[i+2]];
      overviewCtx.fillStyle = heightToColor(height, getShade(normal));
      overviewCtx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }
  overviewCtx.strokeStyle = "#22c55e";
  overviewCtx.lineWidth = 2;
  overviewCtx.strokeRect(
    (viewX / RENDER_SCALE) * scaleX,
    (viewY / RENDER_SCALE) * scaleY,
    (viewWidth / RENDER_SCALE) * scaleX,
    (viewHeight / RENDER_SCALE) * scaleY
  );
}

function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx; lastY = cy;
  dragStartX = cx; dragStartY = cy;
  dragTarget = target;
}
function moveDrag(cx, cy) {
  if (!isDragging || !mesh) return;
  var dx = cx - lastX, dy = cy - lastY;
  if (dragTarget === "detail") {
    viewX -= dx / (detailCanvas.width / viewWidth);
    viewY -= dy / (detailCanvas.height / viewHeight);
  } else {
    var sx = overviewCanvas.width / mesh.width;
    var sy = overviewCanvas.height / mesh.height;
    viewX -= (dx / sx) * RENDER_SCALE;
    viewY -= (dy / sy) * RENDER_SCALE;
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
  if (!mesh) return;
  var rect = overviewCanvas.getBoundingClientRect();
  var mx = cx - rect.left, my = cy - rect.top;
  var sx = overviewCanvas.width / mesh.width;
  var sy = overviewCanvas.height / mesh.height;
  viewX = (mx / sx) * RENDER_SCALE - viewWidth / 2;
  viewY = (my / sy) * RENDER_SCALE - viewHeight / 2;
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
    showError("Chýba element #detailCanvas");
    return;
  }
  loadHeightmap().then(function(heights) {
    heightData = heights;
    mesh = buildMesh(heights);

    if (infoDiv) {
      infoDiv.textContent = "Mesh " + mesh.width + "x" + mesh.height + " | Heightmapa nacitana";
      infoDiv.style.color = "#bbb";
    }

    if (minimapSlider) minimapSlider.value = 72;
    updateCanvasSizes();
    viewX = (mesh.width * RENDER_SCALE - viewWidth) / 2;
    viewY = (mesh.height * RENDER_SCALE - viewHeight) / 2;
    clampView();
    drawAll();
  }).catch(function(err) {
    showError(err.message || String(err));
  });
}

init();
