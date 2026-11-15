// js/main.js
// Ovládanie + minimapa + spustenie mapového modulu

var detailCanvas = document.getElementById("detailCanvas");
var overviewCanvas = document.getElementById("overviewCanvas");
var infoDiv = document.getElementById("info");
var minimapContainer = document.getElementById("minimap-container");
var minimapSlider = document.getElementById("minimapSlider");

var renderer = createMapRenderer(detailCanvas, overviewCanvas);

var isDragging = false;
var lastX = 0, lastY = 0;
var dragTarget = null;
var dragStartX = 0, dragStartY = 0;

function updateCanvasSizes() {
  var bar = document.getElementById("bottom-bar");
  var barHeight = bar ? bar.offsetHeight : 48;

  detailCanvas.width = window.innerWidth;
  detailCanvas.height = window.innerHeight - barHeight;

  if (minimapContainer) {
    minimapContainer.style.bottom = (barHeight + 6) + "px";
  }
  updateMinimapSize();
  renderer.clampView();
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

function startDrag(cx, cy, target) {
  isDragging = true;
  lastX = cx; lastY = cy;
  dragStartX = cx; dragStartY = cy;
  dragTarget = target;
}

function moveDrag(cx, cy) {
  if (!isDragging) return;
  var dx = cx - lastX;
  var dy = cy - lastY;

  if (dragTarget === "detail") renderer.pan(dx, dy);
  else if (dragTarget === "overview") renderer.panOverview(dx, dy);

  lastX = cx; lastY = cy;
  renderer.drawAll();
}

function endDrag(cx, cy) {
  if (dragTarget === "overview" && cx != null) {
    if (Math.hypot(cx - dragStartX, cy - dragStartY) < 6) {
      renderer.centerOnOverview(cx, cy);
      renderer.drawAll();
    }
  }
  isDragging = false;
  dragTarget = null;
}

detailCanvas.addEventListener("mousedown", function (e) {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "detail");
});
detailCanvas.addEventListener("mousemove", function (e) { moveDrag(e.clientX, e.clientY); });
detailCanvas.addEventListener("mouseup", function (e) { endDrag(e.clientX, e.clientY); });
detailCanvas.addEventListener("mouseleave", function () { endDrag(); });

detailCanvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "detail");
}, { passive: false });
detailCanvas.addEventListener("touchmove", function (e) {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
detailCanvas.addEventListener("touchend", function (e) {
  endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY);
});

overviewCanvas.addEventListener("mousedown", function (e) {
  e.preventDefault();
  startDrag(e.clientX, e.clientY, "overview");
});
overviewCanvas.addEventListener("mousemove", function (e) { moveDrag(e.clientX, e.clientY); });
overviewCanvas.addEventListener("mouseup", function (e) { endDrag(e.clientX, e.clientY); });
overviewCanvas.addEventListener("mouseleave", function () { endDrag(); });

overviewCanvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY, "overview");
}, { passive: false });
overviewCanvas.addEventListener("touchmove", function (e) {
  e.preventDefault();
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
overviewCanvas.addEventListener("touchend", function (e) {
  endDrag(e.changedTouches[0] && e.changedTouches[0].clientX, e.changedTouches[0] && e.changedTouches[0].clientY);
});

if (minimapSlider) {
  minimapSlider.addEventListener("input", function () {
    updateMinimapSize();
    renderer.drawAll();
  });
}

window.addEventListener("resize", function () {
  updateCanvasSizes();
  renderer.drawAll();
});

function init() {
  if (infoDiv) infoDiv.textContent = "Nacitam topo mapu...";

  updateCanvasSizes();
  if (minimapSlider) minimapSlider.value = 72;
  updateMinimapSize();

  loadTopoMap("data/topo_map.png")
    .then(function (topo) {
      renderer.setTopo(topo);
      renderer.fitToWidth();
      renderer.drawAll();

      var count = getContourLayerCount();
      var elevs = getAllElevations();
      var minE = elevs[0];
      var maxE = elevs[elevs.length - 1];

      if (infoDiv) {
        infoDiv.textContent =
          "Topo " + topo.width + "x" + topo.height +
          " | Vrstvy: " + count +
          " (" + minE + "–" + maxE + " m) | Bez interpolacie";
        infoDiv.style.color = "#bbb";
      }
    })
    .catch(function (err) {
      if (infoDiv) {
        infoDiv.textContent = "CHYBA: " + (err.message || String(err));
        infoDiv.style.color = "#f87171";
      }
    });
}

init();
