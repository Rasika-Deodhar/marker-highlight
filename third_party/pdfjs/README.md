# pdf.js

Unmodified copies of `build/pdf.min.mjs` and `build/pdf.worker.min.mjs` from
[`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) 6.5.438 (Mozilla, Apache-2.0),
renamed to `.js` so any static host serves them with a JavaScript MIME type.

They are bundled rather than loaded from a CDN so that opening a PDF makes no network
request to a third party, and are only fetched by the browser when a PDF is first opened.

To update: `npm pack pdfjs-dist`, then copy the two files over these.
