// ======================
// Farby terénu
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

const detailCanvas = document.getElementById("detailCanvas");
const overviewCanvas = document.getElementById("overviewCanvas");
const detailCtx = detailCanvas.getContext("2d");
const overviewCtx = overviewCanvas.getContext("2d");
const infoDiv = document.getElementById("info");

const PAGE_SIZE = 420;

let viewWidth = 3;
let viewHeight = 4;

let viewX = 0;
let viewY = 0;

let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragTarget = null; // "detail" alebo "overview"

// ======================
// Načít
