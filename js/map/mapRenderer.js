// js/map/mapRenderer.js
// Vykreslenie topo podkladu + info o vrstvach (zatial bez interpolacie)

function createMapRenderer(detailCanvas, overviewCanvas) {
  var detailCtx = detailCanvas.getContext("2d");
  var overviewCtx = overviewCanvas.getContext("2d");

  var topo = null; // { image, width, height }

  // Pohľad v pixeloch topo mapy
  var viewX = 0;
  var viewY = 0;
  var viewZoom = 1; // 1 = 1 pixel mapy = 1 pixel obrazovky pri fit sirky

  function setTopo(topoData) {
    topo = topoData;
  }

  function clampView() {
    if (!topo) return;
    var visW = detailCanvas.width / viewZoom;
    var visH = detailCanvas.height / viewZoom;
    viewX = Math.max(0, Math.min(topo.width - visW, viewX));
    viewY = Math.max(0, Math.min(topo.height - visH, viewY));
  }

  function fitToWidth() {
    if (!topo) return;
    viewZoom = detailCanvas.width / topo.width;
    viewX = 0;
    viewY = Math.max(0, (topo.height - detailCanvas.height / viewZoom) / 2);
    clampView();
  }

  function drawDetail() {
    if (!topo) return;
    var w = detailCanvas.width;
    var h = detailCanvas.height;
    detailCtx.clearRect(0, 0, w, h);

    var visW = w / viewZoom;
    var visH = h / viewZoom;

    detailCtx.imageSmoothingEnabled = true;
    detailCtx.imageSmoothingQuality = "high";
    detailCtx.drawImage(
      topo.image,
      viewX, viewY, visW, visH,
      0, 0, w, h
    );
  }

  function drawOverview() {
    if (!topo) return;
    var w = overviewCanvas.width;
    var h = overviewCanvas.height;
    overviewCtx.clearRect(0, 0, w, h);

    overviewCtx.imageSmoothingEnabled = true;
    overviewCtx.drawImage(topo.image, 0, 0, w, h);

    var scaleX = w / topo.width;
    var scaleY = h / topo.height;
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

  function drawAll() {
    drawDetail();
    drawOverview();
  }

  function pan(dxScreen, dyScreen) {
    viewX -= dxScreen / viewZoom;
    viewY -= dyScreen / viewZoom;
    clampView();
  }

  function panOverview(dxScreen, dyScreen) {
    if (!topo) return;
    var scaleX = overviewCanvas.width / topo.width;
    var scaleY = overviewCanvas.height / topo.height;
    viewX -= dxScreen / scaleX;
    viewY -= dyScreen / scaleY;
    clampView();
  }

  function centerOnOverview(clientX, clientY) {
    if (!topo) return;
    var rect = overviewCanvas.getBoundingClientRect();
    var mx = clientX - rect.left;
    var my = clientY - rect.top;
    var scaleX = overviewCanvas.width / topo.width;
    var scaleY = overviewCanvas.height / topo.height;
    var visW = detailCanvas.width / viewZoom;
    var visH = detailCanvas.height / viewZoom;
    viewX = mx / scaleX - visW / 2;
    viewY = my / scaleY - visH / 2;
    clampView();
  }

  function getView() {
    return { x: viewX, y: viewY, zoom: viewZoom };
  }

  return {
    setTopo: setTopo,
    fitToWidth: fitToWidth,
    clampView: clampView,
    drawAll: drawAll,
    pan: pan,
    panOverview: panOverview,
    centerOnOverview: centerOnOverview,
    getView: getView
  };
}
