const $ = (id) => document.getElementById(id);

const state = {
  sourceImage: null,
  sourceName: "",
  sourceWidth: 0,
  sourceHeight: 0,
  latestSvg: "",
  latestFileName: "vectormint.svg",
  renderToken: 0,
  applyingPreset: false,
};

const PRESETS = {
  fast: { colors: 5, detail: 400, smooth: 1, denoise: 16, curves: true, edge: "none" },
  balanced: { colors: 6, detail: 640, smooth: 0.8, denoise: 8, curves: true, edge: "none" },
  high: { colors: 10, detail: 920, smooth: 0.6, denoise: 4, curves: true, edge: "sobel" },
  ultra: { colors: 14, detail: 1200, smooth: 0.4, denoise: 2, curves: true, edge: "sobel" },
  fidelity: { colors: 24, detail: 1400, smooth: 0.2, denoise: 0, curves: true, edge: "canny" },
};

const LIMITS = {
  maxFileBytes: 750 * 1024 * 1024,
  maxPixels: 80_000_000,
};

const elements = {
  fileInput: $("fileInput"),
  dropZone: $("dropZone"),
  sourceCanvas: $("sourceCanvas"),
  svgPreview: $("svgPreview"),
  statusText: $("statusText"),
  sourceMeta: $("sourceMeta"),
  pathCount: $("pathCount"),
  svgSize: $("svgSize"),
  downloadButton: $("downloadButton"),
  copyButton: $("copyButton"),
  sampleButton: $("sampleButton"),
  modeSelect: $("modeSelect"),
  presetSelect: $("presetSelect"),
  edgeSelect: $("edgeSelect"),
  colorsRange: $("colorsRange"),
  detailRange: $("detailRange"),
  smoothRange: $("smoothRange"),
  denoiseRange: $("denoiseRange"),
  backgroundToggle: $("backgroundToggle"),
  curveToggle: $("curveToggle"),
  colorsOutput: $("colorsOutput"),
  detailOutput: $("detailOutput"),
  smoothOutput: $("smoothOutput"),
  denoiseOutput: $("denoiseOutput"),
};

function syncOutputs() {
  elements.colorsOutput.value = elements.colorsRange.value;
  elements.detailOutput.value = elements.detailRange.value;
  elements.smoothOutput.value = Number(elements.smoothRange.value).toFixed(1);
  elements.denoiseOutput.value = elements.denoiseRange.value;
  elements.colorsRange.disabled = elements.modeSelect.value === "mono";
  elements.edgeSelect.disabled = elements.modeSelect.value === "mono";
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function resetOutput(message) {
  state.latestSvg = "";
  elements.svgPreview.innerHTML = `<div class="empty-state"><strong>${message}</strong><span>请换一张更小的图片，或先把原图缩放后再导入。Use a smaller image or resize it first.</span></div>`;
  elements.pathCount.textContent = "0";
  elements.svgSize.textContent = "0 KB";
  elements.downloadButton.disabled = true;
  elements.copyButton.disabled = true;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatPixels(pixels) {
  return pixels >= 1_000_000 ? `${(pixels / 1_000_000).toFixed(1)} MP` : String(pixels);
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  state.applyingPreset = true;
  elements.colorsRange.value = preset.colors;
  elements.detailRange.value = preset.detail;
  elements.smoothRange.value = preset.smooth;
  elements.denoiseRange.value = preset.denoise;
  elements.curveToggle.checked = preset.curves;
  elements.edgeSelect.value = preset.edge;
  state.applyingPreset = false;
  scheduleVectorize();
}

function sanitizeFileName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "vectormint";
}

function fitCanvas(canvas, width, height) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(box.width * ratio));
  canvas.height = Math.max(1, Math.floor(box.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);

  if (!state.sourceImage) return;

  const scale = Math.min(box.width / width, box.height / height) * 0.88;
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const x = (box.width - drawWidth) / 2;
  const y = (box.height - drawHeight) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(state.sourceImage, x, y, drawWidth, drawHeight);
}

function drawSourcePreview() {
  fitCanvas(elements.sourceCanvas, state.sourceWidth, state.sourceHeight);
}

function clearSourcePreview() {
  state.sourceImage = null;
  state.sourceName = "";
  state.sourceWidth = 0;
  state.sourceHeight = 0;
  const ctx = elements.sourceCanvas.getContext("2d");
  ctx.clearRect(0, 0, elements.sourceCanvas.width, elements.sourceCanvas.height);
}

async function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > LIMITS.maxFileBytes) {
    setStatus("图片过大 / File too large");
    elements.sourceMeta.textContent = `${formatBytes(file.size)} / 上限 Limit ${formatBytes(LIMITS.maxFileBytes)}`;
    clearSourcePreview();
    resetOutput("文件超过保护限制 / File exceeds safety limit");
    return;
  }

  const headerSize = await readImageSize(file);
  if (headerSize) {
    const pixels = headerSize.width * headerSize.height;
    if (pixels > LIMITS.maxPixels) {
      setStatus("像素过大 / Too many pixels");
      elements.sourceMeta.textContent = `${headerSize.width} × ${headerSize.height} / 上限 Limit ${formatPixels(LIMITS.maxPixels)}`;
      clearSourcePreview();
      resetOutput("图片像素超过保护限制 / Image exceeds pixel limit");
      return;
    }
  }

  setStatus("读取图片 / Loading");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    const pixels = image.naturalWidth * image.naturalHeight;
    if (pixels > LIMITS.maxPixels) {
      setStatus("像素过大 / Too many pixels");
      elements.sourceMeta.textContent = `${formatPixels(pixels)} / 上限 Limit ${formatPixels(LIMITS.maxPixels)}`;
      clearSourcePreview();
      resetOutput("图片像素超过保护限制 / Image exceeds pixel limit");
      return;
    }

    state.sourceImage = image;
    state.sourceName = file.name;
    state.sourceWidth = image.naturalWidth;
    state.sourceHeight = image.naturalHeight;
    state.latestFileName = `${sanitizeFileName(file.name)}.svg`;
    elements.sourceMeta.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    drawSourcePreview();
    scheduleVectorize();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("读取失败 / Load failed");
  };
  image.src = url;
}

async function readImageSize(file) {
  if (file.type === "image/png") return readPngSize(file);
  if (file.type === "image/jpeg") return readJpegSize(file);
  if (file.type === "image/webp") return readWebpSize(file);
  return null;
}

async function readBytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function readPngSize(file) {
  const bytes = await readBytes(file, 0, 24);
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function readJpegSize(file) {
  const bytes = await readBytes(file, 0, Math.min(file.size, 1024 * 1024));
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (!length || offset + length > bytes.length) return null;

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
      };
    }
    offset += length;
  }
  return null;
}

async function readWebpSize(file) {
  const bytes = await readBytes(file, 0, 64);
  if (
    bytes.length < 30 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return null;
  }

  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }

  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: ((bytes[27] << 8) | bytes[26]) & 0x3fff,
      height: ((bytes[29] << 8) | bytes[28]) & 0x3fff,
    };
  }

  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }

  return null;
}

function loadSample() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 620;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f2e9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f766e";
  roundRect(ctx, 155, 105, 590, 400, 66);
  ctx.fill();
  ctx.fillStyle = "#fffdf8";
  ctx.beginPath();
  ctx.arc(445, 305, 148, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d65a31";
  ctx.beginPath();
  ctx.moveTo(440, 165);
  ctx.lineTo(567, 384);
  ctx.lineTo(316, 384);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#315f8f";
  ctx.beginPath();
  ctx.arc(575, 210, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c2321";
  ctx.font = "700 58px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("VectorMint", 450, 560);

  const image = new Image();
  image.onload = () => {
    state.sourceImage = image;
    state.sourceName = "vectormint-sample.png";
    state.sourceWidth = image.naturalWidth;
    state.sourceHeight = image.naturalHeight;
    state.latestFileName = "vectormint-sample.svg";
    elements.sourceMeta.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    drawSourcePreview();
    scheduleVectorize();
  };
  image.src = canvas.toDataURL("image/png");
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function scheduleVectorize() {
  syncOutputs();
  if (!state.sourceImage) return;
  const token = ++state.renderToken;
  setStatus("矢量化中 / Vectorizing");
  window.clearTimeout(scheduleVectorize.timer);
  scheduleVectorize.timer = window.setTimeout(() => {
    try {
      const result = vectorizeImage(readSettings());
      if (token !== state.renderToken) return;
      state.latestSvg = result.svg;
      elements.svgPreview.innerHTML = result.svg;
      elements.pathCount.textContent = String(result.paths);
      elements.svgSize.textContent = `${(new Blob([result.svg]).size / 1024).toFixed(1)} KB`;
      elements.downloadButton.disabled = false;
      elements.copyButton.disabled = false;
      setStatus("完成 / Done");
    } catch (error) {
      console.error(error);
      setStatus("处理失败 / Failed");
    }
  }, 80);
}

function readSettings() {
  return {
    mode: elements.modeSelect.value,
    colors: Number(elements.colorsRange.value),
    maxDimension: Number(elements.detailRange.value),
    smoothness: Number(elements.smoothRange.value),
    denoise: Number(elements.denoiseRange.value),
    removeBackground: elements.backgroundToggle.checked,
    curves: elements.curveToggle.checked,
    edgeAssist: elements.edgeSelect.value,
  };
}

function getProcessingImage(settings) {
  const { maxDimension, mode } = settings;
  const scale = Math.min(1, maxDimension / Math.max(state.sourceWidth, state.sourceHeight));
  const width = Math.max(1, Math.round(state.sourceWidth * scale));
  const height = Math.max(1, Math.round(state.sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = mode === "color";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(state.sourceImage, 0, 0, width, height);
  return { width, height, imageData: ctx.getImageData(0, 0, width, height) };
}

function vectorizeImage(settings) {
  const { width, height, imageData } = getProcessingImage(settings);
  const pixels = imageData.data;

  if (settings.mode === "mono") {
    return vectorizeMono(pixels, width, height, settings);
  }

  const edgeMask = settings.edgeAssist === "none" ? null : createEdgeMask(pixels, width, height, settings.edgeAssist);
  const palette = quantize(
    pixels,
    width,
    height,
    settings.mode === "logo" ? Math.min(settings.colors, 12) : settings.colors,
    edgeMask,
  );
  const assignments = assignPalette(pixels, palette, settings.mode);
  const backgroundIndex = settings.removeBackground ? findBackgroundIndex(assignments, width, height) : -1;
  const layers = palette
    .map((color, index) => ({ color, index }))
    .filter((layer) => layer.index !== backgroundIndex)
    .sort((a, b) => luminance(b.color) - luminance(a.color));

  let body = "";
  let pathCount = 0;
  const minArea = Math.max(1, settings.denoise);

  for (const layer of layers) {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] === layer.index && pixels[i * 4 + 3] > 18) mask[i] = 1;
    }
    const cleaned = filterComponents(mask, width, height, minArea, edgeMask);
    const paths = traceMask(cleaned, width, height, settings.smoothness, settings.curves);
    if (!paths.length) continue;
    body += `<path fill="${rgbToHex(layer.color)}" fill-rule="evenodd" d="${paths.join(" ")}"/>`;
    pathCount += paths.length;
  }

  return buildSvg(body, width, height, pathCount);
}

function vectorizeMono(pixels, width, height, settings) {
  const mask = new Uint8Array(width * height);
  const edgeMask = createEdgeMask(pixels, width, height, "canny");
  let sum = 0;
  let count = 0;

  for (let i = 0; i < width * height; i++) {
    if (pixels[i * 4 + 3] < 18) continue;
    const lum = 0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2];
    sum += lum;
    count++;
  }

  const threshold = count ? sum / count : 128;
  for (let i = 0; i < width * height; i++) {
    const lum = 0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2];
    mask[i] = pixels[i * 4 + 3] > 18 && (lum < threshold || edgeMask[i]) ? 1 : 0;
  }

  const cleaned = filterComponents(mask, width, height, Math.max(1, settings.denoise), edgeMask);
  const paths = traceMask(cleaned, width, height, settings.smoothness, settings.curves);
  const body = paths.length ? `<path fill="#1c2321" fill-rule="evenodd" d="${paths.join(" ")}"/>` : "";
  return buildSvg(body, width, height, paths.length);
}

function buildSvg(body, width, height, pathCount) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision" role="img" aria-label="Vectorized image">${body}</svg>`;
  return { svg, paths: pathCount };
}

function quantize(pixels, width, height, k, edgeMask) {
  const samples = [];
  const sampleBudget = Math.max(24000, k * 7000);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / sampleBudget)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 18) samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
  }
  if (edgeMask) {
    const edgeStep = Math.max(1, Math.floor(step / 2));
    for (let y = 0; y < height; y += edgeStep) {
      for (let x = 0; x < width; x += edgeStep) {
        const index = y * width + x;
        const i = index * 4;
        if (edgeMask[index] && pixels[i + 3] > 18) samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
      }
    }
  }
  if (!samples.length) return [[28, 35, 33]];

  const centers = seedCenters(samples, k);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const color of samples) {
      const index = nearestColor(color, centers);
      sums[index][0] += color[0];
      sums[index][1] += color[1];
      sums[index][2] += color[2];
      sums[index][3]++;
    }
    for (let i = 0; i < centers.length; i++) {
      if (!sums[i][3]) continue;
      centers[i] = [
        Math.round(sums[i][0] / sums[i][3]),
        Math.round(sums[i][1] / sums[i][3]),
        Math.round(sums[i][2] / sums[i][3]),
      ];
    }
  }
  return centers;
}

function seedCenters(samples, k) {
  const centers = [samples[Math.floor(samples.length / 2)]];
  while (centers.length < k && centers.length < samples.length) {
    let best = samples[0];
    let bestDistance = -1;
    for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 600))) {
      const d = Math.min(...centers.map((center) => colorDistance(samples[i], center)));
      if (d > bestDistance) {
        bestDistance = d;
        best = samples[i];
      }
    }
    centers.push(best);
  }
  return centers;
}

function assignPalette(pixels, palette, mode) {
  const assignments = new Uint16Array(pixels.length / 4);
  for (let i = 0; i < assignments.length; i++) {
    let color = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
    if (mode === "logo") color = boostLogoColor(color);
    assignments[i] = nearestColor(color, palette);
  }
  return assignments;
}

function boostLogoColor(color) {
  const avg = (color[0] + color[1] + color[2]) / 3;
  return color.map((channel) => clamp(avg + (channel - avg) * 1.18, 0, 255));
}

function nearestColor(color, palette) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = colorDistance(color, palette[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

function findBackgroundIndex(assignments, width, height) {
  const counts = new Map();
  const add = (index) => counts.set(index, (counts.get(index) || 0) + 1);
  for (let x = 0; x < width; x++) {
    add(assignments[x]);
    add(assignments[(height - 1) * width + x]);
  }
  for (let y = 0; y < height; y++) {
    add(assignments[y * width]);
    add(assignments[y * width + width - 1]);
  }
  let best = -1;
  let bestCount = -1;
  for (const [index, count] of counts) {
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  }
  return best;
}

function filterComponents(mask, width, height, minArea, protectedMask) {
  if (minArea <= 1) return mask;
  const result = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const queue = [];
  const component = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    queue.length = 0;
    component.length = 0;
    queue.push(i);
    seen[i] = 1;

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }

    const hasProtectedPixel = protectedMask && component.some((index) => protectedMask[index]);
    if (component.length >= minArea || hasProtectedPixel) {
      for (const index of component) result[index] = 1;
    }
  }

  return result;
}

function createEdgeMask(pixels, width, height, mode) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    gray[i] = pixels[offset + 3] < 18 ? 255 : 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
  }

  const magnitude = new Float32Array(width * height);
  const values = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] +
        gray[i - width + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + width - 1] +
        gray[i + width + 1];
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1];
      const value = Math.hypot(gx, gy);
      magnitude[i] = value;
      values.push(value);
    }
  }

  values.sort((a, b) => a - b);
  const percentile = mode === "canny" ? 0.82 : 0.88;
  const threshold = values[Math.floor(values.length * percentile)] || 80;
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (magnitude[i] < threshold) continue;
      if (mode === "canny" && !isLocalEdgeMaximum(magnitude, width, i)) continue;
      edges[i] = 1;
    }
  }

  return mode === "canny" ? dilateMask(edges, width, height, 1) : edges;
}

function isLocalEdgeMaximum(magnitude, width, index) {
  const value = magnitude[index];
  return (
    value >= magnitude[index - 1] &&
    value >= magnitude[index + 1] &&
    value >= magnitude[index - width] &&
    value >= magnitude[index + width]
  );
}

function dilateMask(mask, width, height, radius) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) result[ny * width + nx] = 1;
        }
      }
    }
  }
  return result;
}

function traceMask(mask, width, height, smoothness, curves) {
  const edgeMap = new Map();

  function filled(x, y) {
    return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x];
  }

  function addEdge(ax, ay, bx, by) {
    const key = `${ax},${ay}`;
    const edge = { ax, ay, bx, by, used: false };
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key).push(edge);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const paths = [];
  for (const edges of edgeMap.values()) {
    for (const startEdge of edges) {
      if (startEdge.used) continue;
      const points = [[startEdge.ax, startEdge.ay]];
      let edge = startEdge;
      edge.used = true;

      for (let guard = 0; guard < width * height * 8; guard++) {
        points.push([edge.bx, edge.by]);
        const start = points[0];
        if (edge.bx === start[0] && edge.by === start[1]) break;
        const nextEdges = edgeMap.get(`${edge.bx},${edge.by}`) || [];
        edge = nextEdges.find((candidate) => !candidate.used);
        if (!edge) break;
        edge.used = true;
      }

      if (points.length > 3) {
        const simplified = simplifyClosed(points, smoothness);
        paths.push(pointsToPath(simplified, smoothness, curves));
      }
    }
  }
  return paths;
}

function simplifyClosed(points, epsilon) {
  const withoutClose = removeCollinear(points.slice(0, -1));
  if (epsilon <= 0 || withoutClose.length < 6) return withoutClose;

  const anchors = farthestPair(withoutClose);
  const firstChain = circularSlice(withoutClose, anchors.a, anchors.b);
  const secondChain = circularSlice(withoutClose, anchors.b, anchors.a);
  const simplified = rdp(firstChain, epsilon).slice(0, -1).concat(rdp(secondChain, epsilon).slice(0, -1));
  return simplified.length >= 3 ? removeCollinear(simplified) : withoutClose;
}

function removeCollinear(points) {
  if (points.length < 4) return points;
  const cleaned = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const dx1 = current[0] - prev[0];
    const dy1 = current[1] - prev[1];
    const dx2 = next[0] - current[0];
    const dy2 = next[1] - current[1];
    if (dx1 * dy2 !== dy1 * dx2) cleaned.push(current);
  }
  return cleaned;
}

function farthestPair(points) {
  const step = Math.max(1, Math.floor(points.length / 96));
  let best = { a: 0, b: Math.floor(points.length / 2), distance: -1 };
  for (let a = 0; a < points.length; a += step) {
    for (let b = a + step; b < points.length; b += step) {
      const dx = points[a][0] - points[b][0];
      const dy = points[a][1] - points[b][1];
      const distance = dx * dx + dy * dy;
      if (distance > best.distance) best = { a, b, distance };
    }
  }
  return best;
}

function circularSlice(points, start, end) {
  const chain = [];
  let index = start;
  while (true) {
    chain.push(points[index]);
    if (index === end) break;
    index = (index + 1) % points.length;
  }
  return chain;
}

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  const last = points.length - 1;

  for (let i = 1; i < last; i++) {
    const d = perpendicularDistance(points[i], points[0], points[last]);
    if (d > maxDistance) {
      index = i;
      maxDistance = d;
    }
  }

  if (maxDistance > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[last]];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  return Math.abs(dy * point[0] - dx * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]) / Math.hypot(dx, dy);
}

function pointsToPath(points, smoothness, curves) {
  if (!curves || smoothness < 0.2 || points.length < 8) {
    return pointsToLinePath(points);
  }

  const mids = points.map((point, index) => midpoint(point, points[(index + 1) % points.length]));
  let path = `M${fmt(mids[mids.length - 1][0])} ${fmt(mids[mids.length - 1][1])}`;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const mid = mids[i];
    if (isSharpCorner(points, i)) {
      path += `L${fmt(point[0])} ${fmt(point[1])}L${fmt(mid[0])} ${fmt(mid[1])}`;
    } else {
      path += `Q${fmt(point[0])} ${fmt(point[1])} ${fmt(mid[0])} ${fmt(mid[1])}`;
    }
  }

  return `${path}Z`;
}

function pointsToLinePath(points) {
  const [first, ...rest] = points;
  return `M${fmt(first[0])} ${fmt(first[1])}${rest.map((point) => `L${fmt(point[0])} ${fmt(point[1])}`).join("")}Z`;
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function isSharpCorner(points, index) {
  const prev = points[(index - 1 + points.length) % points.length];
  const point = points[index];
  const next = points[(index + 1) % points.length];
  const a = normalize([prev[0] - point[0], prev[1] - point[1]]);
  const b = normalize([next[0] - point[0], next[1] - point[1]]);
  const dot = a[0] * b[0] + a[1] * b[1];
  return dot > -0.45;
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]) || 1;
  return [vector[0] / length, vector[1] / length];
}

function luminance(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function rgbToHex(color) {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function downloadSvg() {
  if (!state.latestSvg) return;
  const blob = new Blob([state.latestSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.latestFileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function copySvg() {
  if (!state.latestSvg) return;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(state.latestSvg);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = state.latestSvg;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const previous = elements.copyButton.textContent;
  elements.copyButton.textContent = "已复制 Copied";
  window.setTimeout(() => {
    elements.copyButton.textContent = previous;
  }, 1100);
}

elements.fileInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
elements.sampleButton.addEventListener("click", loadSample);
elements.downloadButton.addEventListener("click", downloadSvg);
elements.copyButton.addEventListener("click", copySvg);
elements.presetSelect.addEventListener("input", (event) => applyPreset(event.target.value));

for (const control of [
  elements.modeSelect,
  elements.colorsRange,
  elements.edgeSelect,
  elements.detailRange,
  elements.smoothRange,
  elements.denoiseRange,
  elements.backgroundToggle,
  elements.curveToggle,
]) {
  control.addEventListener("input", () => {
    if (!state.applyingPreset && control !== elements.modeSelect) {
      elements.presetSelect.value = "custom";
    }
    scheduleVectorize();
  });
}

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => {
  loadFile(event.dataTransfer.files[0]);
});

window.addEventListener("resize", drawSourcePreview);

syncOutputs();
loadSample();
