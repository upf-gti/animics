import pako from 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.esm.mjs';

self.onmessage = async (e) => {
  const file = e.data;

  const text = await file.text();
  const compressed = pako.gzip(text);

  self.postMessage(new Blob([compressed]));
};