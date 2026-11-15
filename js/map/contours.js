// js/map/contours.js
// Vrstevnice ako layers od najnižšej po najvyššiu
// Zatiaľ BEZ interpolácie a BEZ geometrie bodov

const CONTOUR_LAYERS = [
  { elevation: 330, points: [] },
  { elevation: 335, points: [] },
  { elevation: 340, points: [] },
  { elevation: 345, points: [] },
  { elevation: 350, points: [] },
  { elevation: 355, points: [] },
  { elevation: 360, points: [] },
  { elevation: 365, points: [] },
  { elevation: 370, points: [] },
  { elevation: 375, points: [] },
  { elevation: 380, points: [] },
  { elevation: 385, points: [] },
  { elevation: 390, points: [] },
  { elevation: 395, points: [] },
  { elevation: 400, points: [] },
  { elevation: 405, points: [] },
  { elevation: 410, points: [] },
  { elevation: 415, points: [] },
  { elevation: 420, points: [] },
  { elevation: 425, points: [] },
  { elevation: 430, points: [] },
  { elevation: 435, points: [] },
  { elevation: 440, points: [] },
  { elevation: 445, points: [] },
  { elevation: 450, points: [] },
  { elevation: 455, points: [] },
  { elevation: 460, points: [] },
  { elevation: 465, points: [] },
  { elevation: 470, points: [] },
  { elevation: 475, points: [] },
  { elevation: 480, points: [] },
  { elevation: 485, points: [] },
  { elevation: 490, points: [] },
  { elevation: 495, points: [] },
  { elevation: 500, points: [] },
  { elevation: 505, points: [] },
  { elevation: 510, points: [] },
  { elevation: 515, points: [] },
  { elevation: 520, points: [] },
  { elevation: 525, points: [] },
  { elevation: 530, points: [] },
  { elevation: 535, points: [] },
  { elevation: 540, points: [] },
  { elevation: 545, points: [] },
  { elevation: 550, points: [] },
  { elevation: 555, points: [] },
  { elevation: 560, points: [] },
  { elevation: 565, points: [] },
  { elevation: 570, points: [] },
  { elevation: 575, points: [] },
  { elevation: 580, points: [] },
  { elevation: 585, points: [] },
  { elevation: 590, points: [] },
  { elevation: 595, points: [] },
  { elevation: 600, points: [] },
  { elevation: 605, points: [] },
  { elevation: 610, points: [] },
  { elevation: 615, points: [] },
  { elevation: 620, points: [] },
  { elevation: 625, points: [] },
  { elevation: 630, points: [] },
  { elevation: 634, points: [] }
];

function getContourLayerByElevation(elevation) {
  for (var i = 0; i < CONTOUR_LAYERS.length; i++) {
    if (CONTOUR_LAYERS[i].elevation === elevation) return CONTOUR_LAYERS[i];
  }
  return null;
}

function getAllElevations() {
  return CONTOUR_LAYERS.map(function (l) { return l.elevation; });
}

function getContourLayerCount() {
  return CONTOUR_LAYERS.length;
}
