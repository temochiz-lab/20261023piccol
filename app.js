const fileInput = document.querySelector('#file-input');
const canvas = document.querySelector('#image-canvas');
const ctx = canvas.getContext('2d');
const viewport = document.querySelector('#drop-zone');
const slider = document.querySelector('#zoom-slider');
const zoomValue = document.querySelector('#zoom-value');
const downloadButton = document.querySelector('#download-button');
const copyButton = document.querySelector('#copy-button');
const placeButton = document.querySelector('#place-button');
const backButton = document.querySelector('#back-button');
const toast = document.querySelector('#toast');

let image = null;
let imageName = 'piccol';
let zoom = 1;
let fitZoom = 1;
let shape = 'rect';
let selection = null;
let placedCrop = null;
let mode = 'select';
let dragging = false;
let dragStart = null;
let dragType = null;
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setZoom(value) {
  zoom = Math.max(0.1, Math.min(3, value));
  slider.value = Math.round(zoom * 100);
  zoomValue.textContent = `${slider.value}%`;
  if (image) draw();
}

function fitImage() {
  if (!image) return;
  const availableWidth = Math.max(100, viewport.clientWidth - 36);
  const availableHeight = Math.max(100, viewport.clientHeight - 36);
  fitZoom = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1);
  setZoom(fitZoom);
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
}

function loadImage(blob, name) {
  if (!blob || !blob.type.startsWith('image/')) {
    notify('画像ファイルを選んでください');
    return;
  }
  const url = URL.createObjectURL(blob);
  const nextImage = new Image();
  nextImage.onload = () => {
    if (image?.src?.startsWith('blob:')) URL.revokeObjectURL(image.src);
    image = nextImage;
    imageName = (name || 'piccol').replace(/\.[^.]+$/, '') || 'piccol';
    selection = null;
    placedCrop = null;
    mode = 'select';
    placeButton.hidden = false;
    backButton.hidden = true;
    viewport.classList.remove('placing-crop');
    document.querySelector('#empty-state').hidden = true;
    viewport.classList.add('has-image');
    document.querySelector('#image-status').textContent = name || 'クリップボードの画像';
    document.querySelector('#selection-tip').textContent = 'ドラッグして範囲を選択';
    fitImage();
    updateSelection();
  };
  nextImage.onerror = () => {
    URL.revokeObjectURL(url);
    notify('この画像を開けませんでした');
  };
  nextImage.src = url;
}

function draw() {
  if (!image) return;
  const width = Math.round(image.naturalWidth * zoom);
  const height = Math.round(image.naturalHeight * zoom);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (mode === 'place' && placedCrop) {
    const x = placedCrop.x * zoom;
    const y = placedCrop.y * zoom;
    const w = placedCrop.width * zoom;
    const h = placedCrop.height * zoom;
    ctx.drawImage(placedCrop.canvas, x, y, w, h);
    ctx.save();
    ctx.strokeStyle = '#e4f879';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#e4f879';
    ctx.beginPath();
    ctx.arc(x + w, y + h, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (!selection) return;

  const x = selection.x * zoom;
  const y = selection.y * zoom;
  const w = selection.width * zoom;
  const h = selection.height * zoom;
  ctx.save();
  ctx.fillStyle = 'rgba(19, 20, 16, .48)';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  if (shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill('evenodd');
  ctx.strokeStyle = '#e4f879';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.stroke();
  ctx.restore();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(image.naturalWidth, (event.clientX - rect.left) / zoom)),
    y: Math.max(0, Math.min(image.naturalHeight, (event.clientY - rect.top) / zoom))
  };
}

function enterPlacement() {
  if (!selection || !image) return;
  placedCrop = {
    canvas: renderCrop(),
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height
  };
  mode = 'place';
  placeButton.hidden = true;
  backButton.hidden = false;
  viewport.classList.add('placing-crop');
  document.querySelector('#selection-tip').textContent = '切り抜きをドラッグして移動・右下のハンドルで拡大縮小';
  document.querySelector('#selection-summary').textContent = '切り抜きを配置中 · PNGには画像全体を書き出します';
  document.querySelector('#dimensions-label').textContent = '切り抜きの位置とサイズを調整できます';
  draw();
}

function returnToSelection() {
  mode = 'select';
  placedCrop = null;
  placeButton.hidden = false;
  backButton.hidden = true;
  viewport.classList.remove('placing-crop');
  document.querySelector('#selection-tip').textContent = 'ドラッグして範囲を選択';
  updateSelection();
  draw();
}

function renderOutput() {
  if (mode !== 'place' || !placedCrop) return renderCrop();
  const output = document.createElement('canvas');
  output.width = image.naturalWidth;
  output.height = image.naturalHeight;
  const outputContext = output.getContext('2d');
  outputContext.drawImage(image, 0, 0);
  outputContext.drawImage(placedCrop.canvas, placedCrop.x, placedCrop.y, placedCrop.width, placedCrop.height);
  return output;
}

function makeSelection(start, end) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (shape === 'circle') {
    const side = Math.min(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
    end = { x: start.x + dx, y: start.y + dy };
  }
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return { x, y, width: right - x, height: bottom - y };
}

function updateSelection() {
  const valid = selection && selection.width >= 1 && selection.height >= 1;
  downloadButton.disabled = mode === 'place' ? !placedCrop : !valid;
  copyButton.disabled = mode === 'place' ? !placedCrop : !valid;
  placeButton.disabled = !valid;
  if (!valid) {
    document.querySelector('#dimensions-label').textContent = '範囲を選ぶとサイズが表示されます';
    document.querySelector('#selection-summary').textContent = '切り抜き範囲を選択してください';
    return;
  }
  const width = Math.round(selection.width);
  const height = Math.round(selection.height);
  document.querySelector('#dimensions-label').textContent = `${width} × ${height} px`;
  document.querySelector('#selection-summary').textContent = `${shape === 'circle' ? '円' : '四角'} · ${width} × ${height} px`;
}

function renderCrop() {
  const output = document.createElement('canvas');
  const width = Math.max(1, Math.round(selection.width));
  const height = Math.max(1, Math.round(selection.height));
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  if (shape === 'circle') {
    outputContext.beginPath();
    outputContext.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    outputContext.clip();
  }
  outputContext.drawImage(image, selection.x, selection.y, selection.width, selection.height, 0, 0, width, height);
  return output;
}

function canvasBlob(source) {
  return new Promise((resolve, reject) => source.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNGの生成に失敗しました')), 'image/png'));
}

canvas.addEventListener('pointerdown', event => {
  if (!image) return;
  if (mode === 'place' && placedCrop) {
    const point = canvasPoint(event);
    const right = placedCrop.x + placedCrop.width;
    const bottom = placedCrop.y + placedCrop.height;
    if (Math.hypot(point.x - right, point.y - bottom) <= 14 / zoom) {
      dragType = 'resize';
    } else if (point.x >= placedCrop.x && point.x <= right && point.y >= placedCrop.y && point.y <= bottom) {
      dragType = 'move';
    } else {
      return;
    }
    dragging = true;
    dragStart = point;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  dragging = true;
  dragType = 'select';
  dragStart = canvasPoint(event);
  selection = makeSelection(dragStart, dragStart);
  canvas.setPointerCapture(event.pointerId);
  draw();
  updateSelection();
});
canvas.addEventListener('pointermove', event => {
  if (!dragging) return;
  const point = canvasPoint(event);
  if (mode === 'place' && placedCrop) {
    const deltaX = point.x - dragStart.x;
    const deltaY = point.y - dragStart.y;
    if (dragType === 'move') {
      placedCrop.x = Math.max(0, Math.min(image.naturalWidth - placedCrop.width, placedCrop.x + deltaX));
      placedCrop.y = Math.max(0, Math.min(image.naturalHeight - placedCrop.height, placedCrop.y + deltaY));
    } else {
      const scale = Math.max(0.1, (placedCrop.width + deltaX) / placedCrop.width);
      const nextWidth = Math.min(image.naturalWidth - placedCrop.x, placedCrop.width * scale);
      const nextHeight = Math.min(image.naturalHeight - placedCrop.y, placedCrop.height * scale);
      const actualScale = Math.min(nextWidth / placedCrop.width, nextHeight / placedCrop.height);
      placedCrop.width *= actualScale;
      placedCrop.height *= actualScale;
    }
    dragStart = point;
    draw();
    document.querySelector('#selection-summary').textContent = `配置中 · ${Math.round(placedCrop.width)} × ${Math.round(placedCrop.height)} px`;
    return;
  }
  selection = makeSelection(dragStart, canvasPoint(event));
  draw();
  updateSelection();
});
canvas.addEventListener('pointerup', event => {
  if (!dragging) return;
  dragging = false;
  if (mode === 'place') {
    draw();
    return;
  }
  selection = makeSelection(dragStart, canvasPoint(event));
  draw();
  updateSelection();
});
canvas.addEventListener('pointercancel', () => { dragging = false; });

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) loadImage(file, file.name);
  fileInput.value = '';
});
document.querySelectorAll('.shape-button').forEach(button => button.addEventListener('click', () => {
  shape = button.dataset.shape;
  document.querySelectorAll('.shape-button').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  if (selection && shape === 'circle') {
    const side = Math.min(selection.width, selection.height);
    selection.width = side;
    selection.height = side;
  }
  draw();
  updateSelection();
}));
slider.addEventListener('input', () => setZoom(Number(slider.value) / 100));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
document.querySelector('#fit-button').addEventListener('click', fitImage);
window.addEventListener('resize', () => { if (image) fitImage(); });

document.querySelector('#empty-paste').addEventListener('click', async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(value => value.startsWith('image/'));
      if (type) {
        loadImage(await item.getType(type), 'クリップボードの画像');
        return;
      }
    }
    notify('クリップボードに画像がありません');
  } catch {
    notify('貼り付けできません。画像をコピーして ⌘/Ctrl + V をお試しください');
  }
});
placeButton.addEventListener('click', enterPlacement);
backButton.addEventListener('click', returnToSelection);
window.addEventListener('paste', event => {
  const item = [...(event.clipboardData?.items || [])].find(entry => entry.type.startsWith('image/'));
  if (!item) return;
  const blob = item.getAsFile();
  if (blob) loadImage(blob, 'クリップボードの画像');
});
viewport.addEventListener('dragover', event => {
  event.preventDefault();
  viewport.classList.add('drag-over');
});
viewport.addEventListener('dragleave', event => {
  if (!viewport.contains(event.relatedTarget)) viewport.classList.remove('drag-over');
});
viewport.addEventListener('drop', event => {
  event.preventDefault();
  viewport.classList.remove('drag-over');
  const file = [...event.dataTransfer.files].find(entry => entry.type.startsWith('image/'));
  if (file) loadImage(file, file.name);
  else notify('画像ファイルをドロップしてください');
});
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());

downloadButton.addEventListener('click', async () => {
  if (!selection) return;
  try {
    const blob = await canvasBlob(renderOutput());
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${imageName}-crop.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify('PNGを書き出しました');
  } catch {
    notify('PNGを書き出せませんでした');
  }
});
copyButton.addEventListener('click', async () => {
  if (!selection) return;
  try {
    const blob = await canvasBlob(renderOutput());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    notify('PNGをクリップボードにコピーしました');
  } catch {
    notify('コピーできません。HTTPSまたはlocalhostで開いてください');
  }
});

window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    fileInput.click();
  }
});
