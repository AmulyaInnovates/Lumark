import "./polyfills.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
console.log("Keys:", Object.keys(pdfjs));
if (pdfjs.default) console.log("Default Keys:", Object.keys(pdfjs.default));
