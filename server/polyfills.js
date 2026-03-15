import { createRequire } from "module";
const require = createRequire(import.meta.url);
const DOMMatrix = require("@thednp/dommatrix");
const { ImageData, Path2D } = require("@napi-rs/canvas");

global.DOMMatrix = global.DOMMatrix || DOMMatrix;
global.ImageData = global.ImageData || ImageData;
global.Path2D = global.Path2D || Path2D;

if (typeof global.Uint8Array === 'undefined') {
    global.Uint8Array = Uint8Array;
}

console.log("DEBUG: Enhanced polyfills applied (DOMMatrix, ImageData, Path2D).");
