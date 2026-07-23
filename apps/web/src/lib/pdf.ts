import * as pdfjsLib from 'pdfjs-dist';

// The worker file is copied to /public (see scripts) and served statically.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export { pdfjsLib };
