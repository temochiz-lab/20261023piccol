const fileInput = document.querySelector('#file-input');
const canvas = document.querySelector('#image-canvas');
const ctx = canvas.getContext('2d');
const viewport = document.querySelector('#drop-zone');
const slider = document.querySelector('#zoom-slider');
const zoomValue = document.querySelector('#zoom-value');
const downloadButton = document.querySelector('#download-button');
const copyButton = document.querySelector('#copy-button');
const toast = document.querySelector('#toast');

let image = null;
let imageName = 'piccol';
let zoom = 1;
let fitZoom = 1;
let shape = 'rect';
let selection = null;
let dragging = false;
let dragStart = null;
let dragType = null;
let dragOriginSelection = null;
let resizeAnchor = null;
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
    document.querySelector('#empty-state').hidden = true;
    viewport.classList.add('has-image');
    document.querySelector('#image-status').textContent = name || 'クリップボードの画像';
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
  ctx.setLineDash([]);
  ctx.fillStyle = '#e4f879';
  for (const handle of selectionHandles(selection)) {
    ctx.beginPath();
    ctx.arc(handle.x * zoom, handle.y * zoom, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(image.naturalWidth, (event.clientX - rect.left) / zoom)),
    y: Math.max(0, Math.min(image.naturalHeight, (event.clientY - rect.top) / zoom))
  };
}

function selectionHandles(box) {
  return [
    { x: box.x, y: box.y, corner: 'top-left' },
    { x: box.x + box.width, y: box.y, corner: 'top-right' },
    { x: box.x, y: box.y + box.height, corner: 'bottom-left' },
    { x: box.x + box.width, y: box.y + box.height, corner: 'bottom-right' }
  ];
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
  downloadButton.disabled = !valid;
  copyButton.disabled = !valid;
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
  const point = canvasPoint(event);
  const selectedHandle = selection && selectionHandles(selection).find(handle => Math.hypot(point.x - handle.x, point.y - handle.y) <= 12 / zoom);
  const insideSelection = selection && point.x >= selection.x && point.x <= selection.x + selection.width && point.y >= selection.y && point.y <= selection.y + selection.height;
  if (selectedHandle) {
    dragType = 'resize';
    const opposite = {
      'top-left': { x: selection.x + selection.width, y: selection.y + selection.height },
      'top-right': { x: selection.x, y: selection.y + selection.height },
      'bottom-left': { x: selection.x + selection.width, y: selection.y },
      'bottom-right': { x: selection.x, y: selection.y }
    };
    resizeAnchor = opposite[selectedHandle.corner];
  } else if (insideSelection) {
    dragType = 'move';
  } else {
    dragType = 'select';
  }
  dragging = true;
  dragStart = point;
  dragOriginSelection = selection ? { ...selection } : null;
  if (dragType === 'select') selection = makeSelection(dragStart, dragStart);
  canvas.setPointerCapture(event.pointerId);
  draw();
  updateSelection();
});
canvas.addEventListener('pointermove', event => {
  if (!dragging) return;
  const point = canvasPoint(event);
  if (dragType === 'move' && dragOriginSelection) {
    selection = {
      ...dragOriginSelection,
      x: Math.max(0, Math.min(image.naturalWidth - dragOriginSelection.width, dragOriginSelection.x + point.x - dragStart.x)),
      y: Math.max(0, Math.min(image.naturalHeight - dragOriginSelection.height, dragOriginSelection.y + point.y - dragStart.y))
    };
  } else if (dragType === 'resize' && resizeAnchor) {
    selection = makeSelection(resizeAnchor, point);
  } else {
    selection = makeSelection(dragStart, point);
  }
  draw();
  updateSelection();
});
canvas.addEventListener('pointerup', event => {
  if (!dragging) return;
  dragging = false;
  selection = dragType === 'move' ? selection : (dragType === 'resize' ? makeSelection(resizeAnchor, canvasPoint(event)) : makeSelection(dragStart, canvasPoint(event)));
  dragType = null;
  resizeAnchor = null;
  dragOriginSelection = null;
  draw();
  updateSelection();
});
canvas.addEventListener('pointercancel', () => {
  dragging = false;
  dragType = null;
  resizeAnchor = null;
  dragOriginSelection = null;
});

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
    const blob = await canvasBlob(renderCrop());
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
    const blob = await canvasBlob(renderCrop());
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
