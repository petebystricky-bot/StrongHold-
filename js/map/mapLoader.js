// js/map/mapLoader.js

function loadTopoMap(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = function () {
      resolve({
        image: img,
        width: img.width,
        height: img.height
      });
    };

    img.onerror = function () {
      reject(new Error("Nepodarilo sa nacitat " + url));
    };

    img.src = url + "?" + Date.now();
  });
}
