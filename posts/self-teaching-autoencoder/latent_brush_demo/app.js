const state = {
  manifest: null,
  session: null,
  paletteSelection: [],
  paletteOverlays: [],
  featureChannels: 0,
  featureSide: 0,
  featureArea: 0,
  baseFeatureMap: null,
  sourceFeatureMap: null,
  featureCanvas: null,
  mode: "picker",
  inflight: false,
  rerenderPending: false,
  history: [],
  historyIndex: -1,
  activePickerPatch: null,
  activePickerMeta: null,
};

const paletteList = document.getElementById("palette-list");
const brushChip = document.getElementById("brush-chip");
const selectionLabel = document.getElementById("selection-label");
const selectionNote = document.getElementById("selection-note");
const decodedImage = document.getElementById("decoded-image");
const sourceImage = document.getElementById("source-image");
const paintCanvas = document.getElementById("paint-canvas");
const brushPreviewCanvas = document.getElementById("brush-preview-canvas");
const latentMapCanvas = document.getElementById("latent-map-canvas");
const statusText = document.getElementById("status-text");
const radiusSlider = document.getElementById("radius-slider");
const opacitySlider = document.getElementById("opacity-slider");
const radiusValue = document.getElementById("radius-value");
const opacityValue = document.getElementById("opacity-value");
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const pickerButton = document.getElementById("picker-mode-btn");
const blendButton = document.getElementById("blend-mode-btn");
const eraseButton = document.getElementById("erase-mode-btn");
const rotateLeftButton = document.getElementById("rotate-left-btn");
const rotateRightButton = document.getElementById("rotate-right-btn");

function setStatus(text) {
  statusText.textContent = text;
}

function updateHistoryButtons() {
  undoButton.disabled = state.historyIndex <= 0;
  redoButton.disabled = state.historyIndex >= state.history.length - 1;
}

function commitHistorySnapshot() {
  const snapshot = new Float32Array(state.featureCanvas);
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);
  if (state.history.length > 40) {
    state.history.shift();
  }
  state.historyIndex = state.history.length - 1;
  updateHistoryButtons();
}

function restoreHistorySnapshot(index) {
  if (index < 0 || index >= state.history.length) {
    return;
  }
  state.historyIndex = index;
  state.featureCanvas = new Float32Array(state.history[index]);
  updateHistoryButtons();
  rerenderCanvas();
}

function decodePackedFloatArray(packed) {
  const raw = atob(packed.data_b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function rgbCss(rgb) {
  const parts = rgb.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255));
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseRandomIndices(total, count, seed) {
  const indices = Array.from({ length: total }, (_, idx) => idx);
  const rng = mulberry32(seed);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.min(count, total));
}

function normalizeVector(vector) {
  let norm = 0;
  for (let idx = 0; idx < vector.length; idx += 1) {
    norm += vector[idx] * vector[idx];
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-8) {
    return vector;
  }
  for (let idx = 0; idx < vector.length; idx += 1) {
    vector[idx] /= norm;
  }
  return vector;
}

function powerIterationComponents(rows, componentCount, iterations) {
  const components = [];
  const residualRows = rows.map((row) => new Float32Array(row));
  for (let comp = 0; comp < componentCount; comp += 1) {
    let vector = new Float32Array(state.featureChannels);
    vector[comp % state.featureChannels] = 1;
    normalizeVector(vector);
    for (let iter = 0; iter < iterations; iter += 1) {
      const next = new Float32Array(state.featureChannels);
      for (const row of residualRows) {
        let dot = 0;
        for (let channel = 0; channel < state.featureChannels; channel += 1) {
          dot += row[channel] * vector[channel];
        }
        for (let channel = 0; channel < state.featureChannels; channel += 1) {
          next[channel] += row[channel] * dot;
        }
      }
      vector = normalizeVector(next);
    }
    components.push(vector);
    for (const row of residualRows) {
      let dot = 0;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        dot += row[channel] * vector[channel];
      }
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        row[channel] -= dot * vector[channel];
      }
    }
  }
  return components;
}

function projectColorFromVector(vector) {
  const mean = state.manifest.pcaMean;
  const components = state.manifest.pcaComponents;
  const lo = state.manifest.pcaLo;
  const hi = state.manifest.pcaHi;
  const color = [0, 0, 0];
  for (let out = 0; out < 3; out += 1) {
    let value = 0;
    for (let channel = 0; channel < state.featureChannels; channel += 1) {
      value += (vector[channel] - mean[channel]) * components[channel * 3 + out];
    }
    const denom = Math.max(hi[out] - lo[out], 1e-6);
    color[out] = Math.max(0, Math.min(1, (value - lo[out]) / denom));
  }
  return color;
}

function averageMaskedVector(piece) {
  const vector = new Float32Array(state.featureChannels);
  let count = 0;
  const area = piece.width * piece.height;
  for (let idx = 0; idx < area; idx += 1) {
    if (!piece.mask[idx]) {
      continue;
    }
    count += 1;
    for (let channel = 0; channel < state.featureChannels; channel += 1) {
      vector[channel] += piece.data[channel * area + idx];
    }
  }
  const denom = Math.max(count, 1);
  for (let channel = 0; channel < state.featureChannels; channel += 1) {
    vector[channel] /= denom;
  }
  return vector;
}

function makeFeatureMapImage(featureMap) {
  const featureCount = state.featureSide * state.featureSide;
  const mean = new Float32Array(state.featureChannels);
  for (let channel = 0; channel < state.featureChannels; channel += 1) {
    let sum = 0;
    const base = channel * state.featureArea;
    for (let idx = 0; idx < featureCount; idx += 1) {
      sum += featureMap[base + idx];
    }
    mean[channel] = sum / featureCount;
  }
  const centered = new Array(featureCount);
  for (let idx = 0; idx < featureCount; idx += 1) {
    const row = new Float32Array(state.featureChannels);
    for (let channel = 0; channel < state.featureChannels; channel += 1) {
      row[channel] = featureMap[channel * state.featureArea + idx] - mean[channel];
    }
    centered[idx] = row;
  }
  const components = powerIterationComponents(centered, 3, 12);
  const projected = centered.map((row) => {
    const rgb = [0, 0, 0];
    for (let out = 0; out < 3; out += 1) {
      let value = 0;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        value += row[channel] * components[out][channel];
      }
      rgb[out] = value;
    }
    return rgb;
  });
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let out = 0; out < 3; out += 1) {
    const sorted = projected.map((rgb) => rgb[out]).sort((a, b) => a - b);
    lo[out] = sorted[Math.floor(0.01 * (sorted.length - 1))];
    hi[out] = sorted[Math.floor(0.99 * (sorted.length - 1))];
  }
  const image = new ImageData(state.featureSide, state.featureSide);
  for (let y = 0; y < state.featureSide; y += 1) {
    for (let x = 0; x < state.featureSide; x += 1) {
      const pixelIndex = y * state.featureSide + x;
      const raw = projected[pixelIndex];
      for (let out = 0; out < 3; out += 1) {
        const denom = Math.max(hi[out] - lo[out], 1e-6);
        image.data[pixelIndex * 4 + out] = Math.round(Math.max(0, Math.min(1, (raw[out] - lo[out]) / denom)) * 255);
      }
      image.data[pixelIndex * 4 + 3] = 255;
    }
  }
  return image;
}

function drawFeatureMapToCanvas(canvas, imageData) {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  const scratch = document.createElement("canvas");
  scratch.width = state.featureSide;
  scratch.height = state.featureSide;
  scratch.getContext("2d").putImageData(imageData, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

function clearBrushPreview() {
  const ctx = brushPreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, brushPreviewCanvas.width, brushPreviewCanvas.height);
}

function drawOverlayMask(canvas, meta) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!meta) {
    canvas.classList.remove("active");
    return;
  }
  canvas.classList.add("active");
  const scaleX = canvas.width / state.featureSide;
  const scaleY = canvas.height / state.featureSide;
  ctx.fillStyle = "rgba(199, 83, 47, 0.22)";
  if (meta.mask) {
    for (let y = 0; y < meta.height; y += 1) {
      for (let x = 0; x < meta.width; x += 1) {
        if (!meta.mask[y * meta.width + x]) {
          continue;
        }
        ctx.fillRect((meta.x + x) * scaleX, (meta.y + y) * scaleY, scaleX, scaleY);
      }
    }
  } else {
    ctx.fillRect(meta.x * scaleX, meta.y * scaleY, meta.width * scaleX, meta.height * scaleY);
  }
}

function redrawPaletteOverlays() {
  state.paletteOverlays.forEach(({ overlay, paletteIndex }) => {
    let meta = null;
    if (state.mode === "picker" && state.activePickerMeta && state.activePickerMeta.paletteIndex === paletteIndex) {
      meta = state.activePickerMeta.rect;
    }
    drawOverlayMask(overlay, meta);
  });
}

async function decodeFeatureMapToImage(featureMap) {
  const tensor = new ort.Tensor("float32", featureMap, [1, state.featureChannels, state.featureSide, state.featureSide]);
  const output = await state.session.run({ feature_map: tensor });
  const data = output.image.data;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const pixel = y * 128 + x;
      image.data[pixel * 4 + 0] = Math.round(Math.max(0, Math.min(1, data[pixel])) * 255);
      image.data[pixel * 4 + 1] = Math.round(Math.max(0, Math.min(1, data[128 * 128 + pixel])) * 255);
      image.data[pixel * 4 + 2] = Math.round(Math.max(0, Math.min(1, data[2 * 128 * 128 + pixel])) * 255);
      image.data[pixel * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function rerenderCanvas() {
  if (state.inflight) {
    state.rerenderPending = true;
    return;
  }
  state.inflight = true;
  try {
    const imageData = makeFeatureMapImage(state.featureCanvas);
    drawFeatureMapToCanvas(paintCanvas, imageData);
    drawFeatureMapToCanvas(latentMapCanvas, imageData);
    decodedImage.src = await decodeFeatureMapToImage(state.featureCanvas);
  } finally {
    state.inflight = false;
  }
  if (state.rerenderPending) {
    state.rerenderPending = false;
    rerenderCanvas();
  }
}

function featureCoordsFromPointer(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(state.featureSide - 1, Math.floor(((event.clientX - rect.left) / rect.width) * state.featureSide))),
    y: Math.max(0, Math.min(state.featureSide - 1, Math.floor(((event.clientY - rect.top) / rect.height) * state.featureSide))),
  };
}

function normalizeRect(startX, startY, endX, endY) {
  const minX = Math.max(0, Math.min(startX, endX));
  const minY = Math.max(0, Math.min(startY, endY));
  const maxX = Math.min(state.featureSide - 1, Math.max(startX, endX));
  const maxY = Math.min(state.featureSide - 1, Math.max(startY, endY));
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function extractRectPiece(featureMap, rect) {
  const area = rect.width * rect.height;
  const mask = new Uint8Array(area).fill(1);
  const data = new Float32Array(state.featureChannels * area);
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const srcIndex = (rect.y + y) * state.featureSide + (rect.x + x);
      const dstIndex = y * rect.width + x;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        data[channel * area + dstIndex] = featureMap[channel * state.featureArea + srcIndex];
      }
    }
  }
  return { width: rect.width, height: rect.height, data, mask, meta: rect, angle: 0, textureCanvas: null };
}

function expandPieceToFeatureMap(piece) {
  const map = new Float32Array(state.featureChannels * state.featureArea);
  const area = piece.width * piece.height;
  for (let y = 0; y < piece.height; y += 1) {
    for (let x = 0; x < piece.width; x += 1) {
      const localIndex = y * piece.width + x;
      if (!piece.mask[localIndex]) {
        continue;
      }
      const dstIndex = y * state.featureSide + x;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        map[channel * state.featureArea + dstIndex] = piece.data[channel * area + localIndex];
      }
    }
  }
  return map;
}

function getPieceTextureCanvas(piece) {
  if (piece.textureCanvas) {
    return piece.textureCanvas;
  }
  const texture = document.createElement("canvas");
  texture.width = piece.width;
  texture.height = piece.height;
  const imageData = makeFeatureMapImage(expandPieceToFeatureMap(piece));
  const scratch = document.createElement("canvas");
  scratch.width = state.featureSide;
  scratch.height = state.featureSide;
  scratch.getContext("2d").putImageData(imageData, 0, 0);
  const ctx = texture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, piece.width, piece.height, 0, 0, piece.width, piece.height);
  const alpha = ctx.getImageData(0, 0, piece.width, piece.height);
  for (let py = 0; py < piece.height; py += 1) {
    for (let px = 0; px < piece.width; px += 1) {
      if (!piece.mask[py * piece.width + px]) {
        alpha.data[(py * piece.width + px) * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(alpha, 0, 0);
  piece.textureCanvas = texture;
  return texture;
}

function updateSelectionUI() {
  if (state.mode === "picker" && state.activePickerPatch) {
    brushChip.style.background = rgbCss(projectColorFromVector(averageMaskedVector(state.activePickerPatch)));
    selectionLabel.textContent = `Picker ${state.activePickerPatch.width}x${state.activePickerPatch.height}`;
    selectionNote.textContent = "Paint directly using the current box or single-point selection.";
    return;
  }
  brushChip.style.background = rgbCss([0.5, 0.5, 0.5]);
  selectionLabel.textContent = "No region selected";
  if (state.mode === "picker") {
    selectionNote.textContent = "Picker mode: click or drag a box on a palette feature map, then paint on the canvas.";
  } else if (state.mode === "blend") {
    selectionNote.textContent = "Blend mode smooths transitions by mixing edits back toward the source face.";
  } else {
    selectionNote.textContent = "Erase blends back toward the current source face.";
  }
}

function drawPiecePreviewAt(piece, normX, normY) {
  const ctx = brushPreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, brushPreviewCanvas.width, brushPreviewCanvas.height);
  if (!piece) {
    return;
  }
  const texture = getPieceTextureCanvas(piece);
  const scale = parseFloat(radiusSlider.value);
  const scaleX = brushPreviewCanvas.width / state.featureSide;
  const scaleY = brushPreviewCanvas.height / state.featureSide;
  const destCenterX = Math.round(normX * (state.featureSide - 1));
  const destCenterY = Math.round(normY * (state.featureSide - 1));
  const drawWidth = Math.max(1, Math.round(piece.width * scale));
  const drawHeight = Math.max(1, Math.round(piece.height * scale));
  const halfWidth = Math.floor(drawWidth / 2);
  const halfHeight = Math.floor(drawHeight / 2);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(destCenterX * scaleX, destCenterY * scaleY);
  ctx.rotate((piece.angle || 0) * Math.PI / 180);
  ctx.drawImage(texture, -drawWidth * scaleX / 2, -drawHeight * scaleY / 2, drawWidth * scaleX, drawHeight * scaleY);
  ctx.restore();
}

function rotatePiece(piece, direction) {
  const delta = direction === "right" ? 10 : -10;
  return {
    ...piece,
    angle: ((piece.angle || 0) + delta + 360) % 360,
  };
}

function applyPieceAt(piece, normX, normY, opacity) {
  const scale = parseFloat(radiusSlider.value);
  const destCenterX = Math.round(normX * (state.featureSide - 1));
  const destCenterY = Math.round(normY * (state.featureSide - 1));
  const drawWidth = Math.max(1, Math.round(piece.width * scale));
  const drawHeight = Math.max(1, Math.round(piece.height * scale));
  const halfWidth = Math.floor(drawWidth / 2);
  const halfHeight = Math.floor(drawHeight / 2);
  const area = piece.width * piece.height;
  const angle = -((piece.angle || 0) * Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let py = 0; py < drawHeight; py += 1) {
    for (let px = 0; px < drawWidth; px += 1) {
      const localX = px - drawWidth / 2 + 0.5;
      const localY = py - drawHeight / 2 + 0.5;
      const rotX = localX * cos - localY * sin;
      const rotY = localX * sin + localY * cos;
      const srcXf = (rotX / Math.max(drawWidth, 1)) * piece.width + piece.width / 2;
      const srcYf = (rotY / Math.max(drawHeight, 1)) * piece.height + piece.height / 2;
      const srcX = Math.min(piece.width - 1, Math.max(0, Math.floor(srcXf)));
      const srcY = Math.min(piece.height - 1, Math.max(0, Math.floor(srcYf)));
      const localIndex = srcY * piece.width + srcX;
      if (!piece.mask[localIndex]) {
        continue;
      }
      const targetX = destCenterX + px - halfWidth;
      const targetY = destCenterY + py - halfHeight;
      if (targetX < 0 || targetY < 0 || targetX >= state.featureSide || targetY >= state.featureSide) {
        continue;
      }
      const targetIndex = targetY * state.featureSide + targetX;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        const canvasIndex = channel * state.featureArea + targetIndex;
        const pieceIndex = channel * area + localIndex;
        const sourceValue = piece.data[pieceIndex];
        state.featureCanvas[canvasIndex] = state.featureCanvas[canvasIndex] * (1 - opacity) + sourceValue * opacity;
      }
    }
  }
}

function paintRectPatch(patch, normX, normY) {
  const opacity = parseFloat(opacitySlider.value);
  applyPieceAt(patch, normX, normY, opacity);
}

function eraseAt(normX, normY) {
  const radius = parseFloat(radiusSlider.value);
  const opacity = parseFloat(opacitySlider.value);
  for (let y = 0; y < state.featureSide; y += 1) {
    for (let x = 0; x < state.featureSide; x += 1) {
      const dx = x - normX * (state.featureSide - 1);
      const dy = y - normY * (state.featureSide - 1);
      const weight = Math.min(1, Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius)) * opacity);
      if (weight < 1e-4) {
        continue;
      }
      const pixelIndex = y * state.featureSide + x;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        const index = channel * state.featureArea + pixelIndex;
        state.featureCanvas[index] = state.featureCanvas[index] * (1 - weight) + state.sourceFeatureMap[index] * weight;
      }
    }
  }
}

function blendAt(normX, normY) {
  const radius = parseFloat(radiusSlider.value);
  const opacity = parseFloat(opacitySlider.value) * 0.5;
  for (let y = 0; y < state.featureSide; y += 1) {
    for (let x = 0; x < state.featureSide; x += 1) {
      const dx = x - normX * (state.featureSide - 1);
      const dy = y - normY * (state.featureSide - 1);
      const weight = Math.min(1, Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius)) * opacity);
      if (weight < 1e-4) {
        continue;
      }
      const pixelIndex = y * state.featureSide + x;
      for (let channel = 0; channel < state.featureChannels; channel += 1) {
        const index = channel * state.featureArea + pixelIndex;
        const base = state.sourceFeatureMap[index];
        const current = state.featureCanvas[index];
        const blended = 0.6 * current + 0.4 * base;
        state.featureCanvas[index] = current * (1 - weight) + blended * weight;
      }
    }
  }
}

function canvasPointerPosition(event) {
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function handleCanvasAction(event) {
  const pos = canvasPointerPosition(event);
  if (state.mode === "erase") {
    eraseAt(pos.x, pos.y);
    return true;
  }
  if (state.mode === "blend") {
    blendAt(pos.x, pos.y);
    return true;
  }
  if (state.mode === "picker") {
    if (!state.activePickerPatch) {
      setStatus("Pick a point or drag a box on a palette feature map first.");
      return false;
    }
    paintRectPatch(state.activePickerPatch, pos.x, pos.y);
    return true;
  }
  return false;
}

function currentPreviewPiece() {
  if (state.mode === "picker") {
    return state.activePickerPatch;
  }
  return null;
}

function makePaletteCard(item, paletteIndex) {
  const card = document.createElement("section");
  card.className = "palette-card";
  const wrapper = document.createElement("div");
  wrapper.className = "palette-grid";
  const image = document.createElement("img");
  image.src = item.imagePath;
  image.alt = `Palette face ${paletteIndex + 1}`;
  image.className = "source-pick";
  const featureWrap = document.createElement("div");
  featureWrap.className = "feature-wrap";
  const featureCanvas = document.createElement("canvas");
  featureCanvas.width = 128;
  featureCanvas.height = 128;
  const overlay = document.createElement("canvas");
  overlay.width = 128;
  overlay.height = 128;
  overlay.className = "feature-overlay";
  drawFeatureMapToCanvas(featureCanvas, makeFeatureMapImage(item.featureMap));
  featureWrap.appendChild(featureCanvas);
  featureWrap.appendChild(overlay);
  wrapper.appendChild(image);
  wrapper.appendChild(featureWrap);
  const note = document.createElement("p");
  note.className = "palette-note";
  note.textContent = "Click face to set the base. Picker mode uses box or point selection.";
  card.appendChild(wrapper);
  card.appendChild(note);

  image.addEventListener("click", () => {
    setSourceItem(item);
    setStatus("Source face updated.");
  });

  const selectionState = { dragging: false, startX: 0, startY: 0, moved: false };
  featureCanvas.addEventListener("pointerdown", (event) => {
    if (state.mode !== "picker") {
      return;
    }
    selectionState.dragging = true;
    selectionState.moved = false;
    const coords = featureCoordsFromPointer(event, featureCanvas);
    selectionState.startX = coords.x;
    selectionState.startY = coords.y;
    drawOverlayMask(overlay, normalizeRect(coords.x, coords.y, coords.x, coords.y));
  });
  featureCanvas.addEventListener("pointermove", (event) => {
    if (state.mode === "picker" && selectionState.dragging) {
      selectionState.moved = true;
      const coords = featureCoordsFromPointer(event, featureCanvas);
      drawOverlayMask(overlay, normalizeRect(selectionState.startX, selectionState.startY, coords.x, coords.y));
    }
  });
  const finishPickerSelection = (event) => {
    if (state.mode !== "picker" || !selectionState.dragging) {
      return;
    }
    selectionState.dragging = false;
    const coords = featureCoordsFromPointer(event, featureCanvas);
    const rect = normalizeRect(selectionState.startX, selectionState.startY, coords.x, coords.y);
    state.activePickerPatch = extractRectPiece(item.featureMap, rect);
    state.activePickerMeta = { paletteIndex, rect };
    updateSelectionUI();
    redrawPaletteOverlays();
    setStatus(`Picker selection: ${rect.width}x${rect.height}.`);
  };
  featureCanvas.addEventListener("pointerup", finishPickerSelection);
  featureCanvas.addEventListener("pointerleave", finishPickerSelection);
  featureCanvas.addEventListener("click", (event) => {
    if (state.mode === "picker") {
      if (selectionState.moved) {
        return;
      }
      const coords = featureCoordsFromPointer(event, featureCanvas);
      const rect = { x: coords.x, y: coords.y, width: 1, height: 1 };
      state.activePickerPatch = extractRectPiece(item.featureMap, rect);
      state.activePickerMeta = { paletteIndex, rect };
      updateSelectionUI();
      redrawPaletteOverlays();
    }
  });

  state.paletteOverlays.push({ overlay, paletteIndex });
  return card;
}

function setSourceItem(item) {
  state.sourceFeatureMap = new Float32Array(item.featureMap);
  if (sourceImage) {
    sourceImage.src = item.imagePath;
  }
  resetCanvas();
}

function renderPalette() {
  state.paletteOverlays = [];
  paletteList.innerHTML = "";
  state.paletteSelection.forEach((item, idx) => {
    paletteList.appendChild(makePaletteCard(item, idx));
  });
  redrawPaletteOverlays();
}

function resetCanvas() {
  state.featureCanvas = new Float32Array(state.sourceFeatureMap ?? state.baseFeatureMap);
  state.history = [];
  state.historyIndex = -1;
  state.activePickerPatch = null;
  state.activePickerMeta = null;
  updateSelectionUI();
  redrawPaletteOverlays();
  commitHistorySnapshot();
  rerenderCanvas();
}

function randomizePalette() {
  const count = state.manifest.paletteVisibleCount;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const indices = chooseRandomIndices(state.manifest.items.length, count, seed);
  state.paletteSelection = indices.map((idx) => state.manifest.items[idx]);
  renderPalette();
  setSourceItem(state.paletteSelection[0]);
  setStatus("New palette ready.");
}

function updateModeButtons() {
  pickerButton.classList.toggle("active", state.mode === "picker");
  blendButton.classList.toggle("active", state.mode === "blend");
  eraseButton.classList.toggle("active", state.mode === "erase");
}

function wireEvents() {
  paintCanvas.addEventListener("pointerdown", (event) => {
    const handled = handleCanvasAction(event);
    if (!handled) {
      return;
    }
    state.drawing = true;
    paintCanvas.setPointerCapture(event.pointerId);
    rerenderCanvas();
  });
  paintCanvas.addEventListener("pointermove", (event) => {
    if (state.mode === "picker") {
      const piece = currentPreviewPiece();
      if (piece) {
        const pos = canvasPointerPosition(event);
        drawPiecePreviewAt(piece, pos.x, pos.y);
      } else {
        clearBrushPreview();
      }
    }
    if (!state.drawing) {
      return;
    }
    const handled = handleCanvasAction(event);
    if (handled) {
      rerenderCanvas();
    }
  });
  const endDrawing = (event) => {
    if (event && paintCanvas.hasPointerCapture(event.pointerId)) {
      paintCanvas.releasePointerCapture(event.pointerId);
    }
    if (state.drawing) {
      commitHistorySnapshot();
    }
    state.drawing = false;
  };
  paintCanvas.addEventListener("pointerup", endDrawing);
  paintCanvas.addEventListener("pointercancel", endDrawing);
  paintCanvas.addEventListener("pointerleave", () => {
    clearBrushPreview();
  });

  radiusSlider.addEventListener("input", () => {
    radiusValue.textContent = parseFloat(radiusSlider.value).toFixed(2);
  });
  opacitySlider.addEventListener("input", () => {
    opacityValue.textContent = parseFloat(opacitySlider.value).toFixed(2);
  });

  rotateLeftButton.addEventListener("click", () => {
    if (state.mode === "picker" && state.activePickerPatch) {
      state.activePickerPatch = rotatePiece(state.activePickerPatch, "left");
      updateSelectionUI();
      setStatus("Rotated picker selection left.");
    }
  });
  rotateRightButton.addEventListener("click", () => {
    if (state.mode === "picker" && state.activePickerPatch) {
      state.activePickerPatch = rotatePiece(state.activePickerPatch, "right");
      updateSelectionUI();
      setStatus("Rotated picker selection right.");
    }
  });

  pickerButton.addEventListener("click", () => {
    state.mode = "picker";
    updateModeButtons();
    clearBrushPreview();
    updateSelectionUI();
    redrawPaletteOverlays();
  });
  blendButton.addEventListener("click", () => {
    state.mode = "blend";
    updateModeButtons();
    clearBrushPreview();
    updateSelectionUI();
    redrawPaletteOverlays();
  });
  eraseButton.addEventListener("click", () => {
    state.mode = "erase";
    updateModeButtons();
    clearBrushPreview();
    updateSelectionUI();
    redrawPaletteOverlays();
  });

  document.getElementById("randomize-btn").addEventListener("click", randomizePalette);
  document.getElementById("reset-btn").addEventListener("click", () => {
    resetCanvas();
    setStatus("Canvas reset.");
  });
  undoButton.addEventListener("click", () => {
    if (state.historyIndex > 0) {
      restoreHistorySnapshot(state.historyIndex - 1);
      setStatus("Undid last edit.");
    }
  });
  redoButton.addEventListener("click", () => {
    if (state.historyIndex < state.history.length - 1) {
      restoreHistorySnapshot(state.historyIndex + 1);
      setStatus("Redid edit.");
    }
  });
}

async function initRuntime() {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = "./vendor/";
  state.session = await ort.InferenceSession.create("./decoder.onnx", {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
}

async function loadManifest() {
  const response = await fetch("./palette_bank.json");
  const payload = await response.json();
  state.manifest = {
    items: payload.items.map((item) => ({
      imagePath: item.image_path,
      featureMap: decodePackedFloatArray(item.feature_map),
    })),
    paletteVisibleCount: payload.palette_visible_count,
    baseFeatureMap: decodePackedFloatArray(payload.base_feature_map),
    pcaMean: decodePackedFloatArray(payload.pca_mean),
    pcaComponents: decodePackedFloatArray(payload.pca_components),
    pcaLo: decodePackedFloatArray(payload.pca_lo),
    pcaHi: decodePackedFloatArray(payload.pca_hi),
  };
  state.featureChannels = payload.editable_feature_shape[0];
  state.featureSide = payload.editable_feature_shape[1];
  state.featureArea = state.featureSide * state.featureSide;
  state.baseFeatureMap = state.manifest.baseFeatureMap;
}

async function boot() {
  setStatus("Loading ONNX decoder and palette bank...");
  await loadManifest();
  await initRuntime();
  wireEvents();
  updateModeButtons();
  randomizePalette();
  updateSelectionUI();
  setStatus("Picker: select direct boxes or points. Erase: blend back to source.");
}

boot().catch((error) => {
  console.error(error);
  setStatus(`Failed to load demo: ${error.message}`);
});
