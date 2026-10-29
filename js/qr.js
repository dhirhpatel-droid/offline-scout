// QR codes on the phone (docs/adr/0004): drawing one, and reading them from
// the camera. Both work with no signal. The libraries are copied into
// vendor/ (and cached by the service worker), never loaded from the internet.
//
// Reading: phones with a built-in barcode reader (Android Chrome) use it;
// others (iPhones) use jsQR, which is only loaded when the camera opens.

import qrcode from '../vendor/qrcode-generator-2.0.4.mjs';

// The text → an <svg> QR code, dark on white with the quiet margin scanners need.
export function qrSvg(text) {
  const qr = qrcode(0, 'M'); // 0 = smallest size that fits; M = medium error correction
  qr.addData(text, 'Byte');
  qr.make();
  const holder = document.createElement('div');
  holder.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  const svg = holder.firstElementChild;
  svg.setAttribute('role', 'img');
  return svg;
}

let jsQRLoading = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQRLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsqr-1.4.0.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error('Couldn’t open the QR reader. Close and reopen the app, then try again.'));
    document.head.append(s);
  });
  return jsQRLoading;
}

// Open the back camera in <video> and call onText(text) for each code read
// (the same code is reported again while it stays in view; the caller skips
// repeats). Returns stop().
export async function startScanner(video, onText) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }, audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', ''); // iPhones: play in the page, not full screen
  video.muted = true;
  await video.play();

  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch { detector = null; }
  }
  const jsQR = detector ? null : await loadJsQR();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let running = true;
  let busy = false;
  const timer = setInterval(async () => {
    if (!running || busy || video.readyState < 2) return;
    busy = true;
    try {
      if (detector) {
        for (const code of await detector.detect(video)) onText(code.rawValue);
      } else {
        // Read a centred square, scaled down: quicker on older phones.
        const side = Math.min(video.videoWidth, video.videoHeight);
        const size = Math.min(side, 640);
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
        const found = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' });
        if (found?.data) onText(found.data);
      }
    } catch { /* a frame that couldn't be read: try the next one */ }
    busy = false;
  }, 200);

  return function stop() {
    running = false;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}
