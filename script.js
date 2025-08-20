// ===== Utilidades =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STORAGE_KEY = "todo.tasks.v2";
const THEME_KEY = "todo.theme";

const priorityWeight = { high: 3, medium: 2, low: 1 };

// ===== Elementos =====
const form = $("#formulary");
const inputTask = $("#task");
const inputDue = $("#due");
const inputPriority = $("#priority");
const tbody = $("#tbody");
const noRow = $("#no-tasks-row");

const search = $("#search");
const filterStatus = $("#filterStatus");
const sortBy = $("#sortBy");

const countTotal = $("#count-total");
const countPending = $("#count-pending");
const countDone = $("#count-done");

const clearCompletedBtn = $("#clearCompleted");
const markAllDoneBtn = $("#markAllDone");
const themeToggle = $("#themeToggle");

// === Captura: un botón y un input (usamos ambos flujos)
const scanBtn = $("#scanBtn");
const scanInput = $("#scanInput");

// === Modal de cámara (getUserMedia)
const cameraModal = $("#cameraModal");
const camClose = $("#camClose");
const camPreview = $("#camPreview");
const camCanvas = $("#camCanvas");
const camShot = $("#camShot");
const camSwitch = $("#camSwitch");
const camTorch = $("#camTorch");
const camRotateL = $("#camRotateL");
const camRotateR = $("#camRotateR");

let camStream = null;
let usingFacing = "environment";
let torchOn = false;
let rotation = 0;

// ===== Estado =====
let tasks = loadTasks();
let ui = { query: "", filter: "all", sort: "createdDesc" };

// ===== Inicio =====
restoreTheme();
render();

// ===== Listeners =====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = inputTask.value.trim();
  if (!name) return;

  const t = {
    id: crypto.randomUUID(),
    name,
    due: inputDue.value || null,
    priority: inputPriority.value || "medium",
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  tasks.unshift(t);
  saveTasks();
  render();
  form.reset();

  Swal.fire({
    toast: true,
    position: "top",
    icon: "success",
    title: "Tarea agregada",
    showConfirmButton: false,
    timer: 1400,
  });
});

search.addEventListener("input", () => { ui.query = search.value.trim().toLowerCase(); render(); });
filterStatus.addEventListener("change", () => { ui.filter = filterStatus.value; render(); });
sortBy.addEventListener("change", () => { ui.sort = sortBy.value; render(); });

clearCompletedBtn.addEventListener("click", async () => {
  if (!tasks.some(t => t.completed)) return;
  const res = await Swal.fire({
    title: "Eliminar completadas",
    text: "¿Seguro que quieres eliminar todas las tareas completadas?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí",
    cancelButtonText: "No",
    reverseButtons: true
  });
  if (res.isConfirmed) {
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    render();
    Swal.fire({ icon: "success", title: "Eliminadas", timer: 1200, showConfirmButton: false });
  }
});

markAllDoneBtn.addEventListener("click", () => {
  const allCompleted = tasks.every(t => t.completed);
  tasks = tasks.map(t => ({ ...t, completed: !allCompleted }));
  saveTasks();
  render();
});

themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
});

// Delegación de eventos para acciones de filas (tabla)
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = tr?.dataset.id;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const action = btn.dataset.action;

  if (action === "toggle") {
    task.completed = !task.completed;
    task.updatedAt = Date.now();
    saveTasks(); render();
  }

  if (action === "edit") {
    await editTask(task);
  }

  if (action === "delete") {
    const res = await Swal.fire({
      title: "¿Eliminar esta tarea?",
      text: "No podrás deshacerlo",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí",
      cancelButtonText: "No",
      reverseButtons: true
    });
    if (res.isConfirmed) {
      tasks = tasks.filter(t => t.id !== id);
      saveTasks(); render();
      Swal.fire({ icon: "success", title: "Tarea eliminada", timer: 1200, showConfirmButton: false });
    }
  }
});

// Doble click en título para editar
tbody.addEventListener("dblclick", async (e) => {
  const cell = e.target.closest("td.editable");
  if (!cell) return;
  const tr = cell.closest("tr");
  const id = tr.dataset.id;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  await editTask(task);
});

// ======== CAPTURA: Cámara o Galería ========

// Botón principal: elegir cámara (modal) o galería (input)
scanBtn.addEventListener("click", async () => {
  const res = await Swal.fire({
    title: "Añadir desde foto",
    text: "¿Cómo quieres capturar la lista?",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: "Cámara",
    denyButtonText: "Galería",
    cancelButtonText: "Cancelar",
  });
  if (res.isConfirmed) {
    // Intentamos getUserMedia; si falla, caemos a input con capture
    try {
      await openCameraModal();
    } catch {
      scanInput.setAttribute("capture", "environment");
      scanInput.click();
      // quitamos capture tras abrir para que no fuerce cámara siempre
      setTimeout(() => scanInput.removeAttribute("capture"), 0);
    }
  } else if (res.isDenied) {
    scanInput.removeAttribute("capture");
    scanInput.click();
  }
});

// Galería / cámara nativa fallback
scanInput.addEventListener("change", async () => {
  const file = scanInput.files?.[0];
  if (!file) return;
  try {
    const bmp = await toImageBitmap(file);          // respeta orientación EXIF
    const canvas = bitmapToProcessedCanvas(bmp);    // escala + gris + umbral
    const text = await ocrCanvas(canvas);
    await importDirect(text);                       // crea tareas automáticamente
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "No se pudo leer la imagen" });
  } finally {
    scanInput.value = "";
  }
});

// ==== Modal de cámara (getUserMedia) ====
async function openCameraModal() {
  rotation = 0; torchOn = false;
  cameraModal.hidden = false;
  await startCamera();
}

camClose.addEventListener("click", closeCameraModal);
camSwitch.addEventListener("click", async () => {
  usingFacing = usingFacing === "environment" ? "user" : "environment";
  await startCamera();
});
camTorch.addEventListener("click", async () => { await toggleTorch(); });
camRotateL.addEventListener("click", () => { rotation = (rotation - 90 + 360) % 360; });
camRotateR.addEventListener("click", () => { rotation = (rotation + 90) % 360; });

camShot.addEventListener("click", async () => {
  if (!camStream) return;
  try {
    const frame = captureFrame({ rotation });
    const text = await ocrCanvas(frame);
    closeCameraModal();
    await importDirect(text);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "No se pudo leer la imagen" });
  }
});

function closeCameraModal() { stopCamera(); cameraModal.hidden = true; }

async function startCamera() {
  stopCamera();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: usingFacing,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    camPreview.srcObject = camStream;
    // Espera a que el video tenga dimensiones
    await new Promise((res) => {
      if (camPreview.readyState >= 2) res();
      else camPreview.onloadedmetadata = () => res();
    });
    await setTorch(false);
  } catch (err) {
    stopCamera();
    cameraModal.hidden = true;
    // Propaga para que el flujo haga fallback a <input capture>
    throw err;
  }
}

function stopCamera() {
  camStream?.getTracks?.().forEach(t => t.stop());
  camStream = null;
}

async function toggleTorch() {
  torchOn = !torchOn;
  const ok = await setTorch(torchOn);
  if (!ok) {
    torchOn = false;
    Swal.fire({ icon: "info", title: "Linterna no soportada", timer: 1200, showConfirmButton: false });
  }
}
async function setTorch(on) {
  try {
    const track = camStream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (!track || !caps?.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch { return false; }
}

// Capturar frame + preprocesado (gris + umbral)
function captureFrame({ rotation = 0 } = {}) {
  const video = camPreview;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Video no listo");

  const MAX_SIDE = 2048;
  let cw = vw, ch = vh;
  if (Math.max(vw, vh) > MAX_SIDE) {
    const s = MAX_SIDE / Math.max(vw, vh);
    cw = Math.round(vw * s); ch = Math.round(vh * s);
  }

  const rot = rotation % 360;
  const swap = rot === 90 || rot === 270;
  const W = swap ? ch : cw;
  const H = swap ? cw : ch;

  camCanvas.width = W; camCanvas.height = H;
  const ctx = camCanvas.getContext("2d");

  ctx.save();
  if (rot === 90) ctx.translate(W, 0);
  if (rot === 180) ctx.translate(W, H);
  if (rot === 270) ctx.translate(0, H);
  ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(video, 0, 0, cw, ch);
  ctx.restore();

  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) { // gris
    const y = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114);
    d[i]=d[i+1]=d[i+2]=y;
  }
  const th = otsuThreshold(d);
  for (let i = 0; i < d.length; i += 4) { // binario
    const v = d[i] > th ? 255 : 0;
    d[i]=d[i+1]=d[i+2]=v;
  }
  ctx.putImageData(id, 0, 0);

  return camCanvas;
}

function otsuThreshold(data) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const total = data.length / 4;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, thr = 127;
  for (let t = 0, wF = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) { max = between; thr = t; }
  }
  return thr;
}

// ===== OCR helpers =====
async function ocrCanvas(canvas) {
  showOcrProgress();
  try {
    const blob = await new Promise(res => canvas.toBlob(res, "image/png", 1));
    const { data } = await Tesseract.recognize(blob, 'spa+eng', { logger: updateOcrProgress, psm: 6 });
    Swal.close();
    return data?.text || "";
  } catch (e) { Swal.close(); throw e; }
}
function showOcrProgress() {
  Swal.fire({
    title: "Leyendo texto…",
    html: `<div id="ocrProgressText" style="margin-top:8px;color:#8aa4bf">Inicializando</div>
           <div style="height:8px;background:#1a2434;border-radius:6px;margin-top:10px;overflow:hidden">
             <div id="ocrBar" style="height:100%;width:0%;background:#08dcdc;transition:width .2s ease;"></div>
           </div>`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });
}
function updateOcrProgress(m) {
  const t = document.getElementById('ocrProgressText');
  const b = document.getElementById('ocrBar');
  if (t && m.status) t.textContent = `${m.status} (${Math.round((m.progress||0)*100)}%)`;
  if (b && typeof m.progress === 'number') b.style.width = `${Math.round(m.progress*100)}%`;
}

// Carga respetando orientación EXIF si hay createImageBitmap
async function toImageBitmap(file) {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  }
  // Fallback
  const img = await new Promise((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  return img;
}
function bitmapToProcessedCanvas(img) {
  const MAX = 2048;
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  let cw = w, ch = h;
  if (Math.max(w,h) > MAX) {
    const s = MAX / Math.max(w,h); cw = Math.round(w*s); ch = Math.round(h*s);
  }
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, cw, ch);

  const id = g.getImageData(0,0,cw,ch);
  const d = id.data;
  for (let i=0;i<d.length;i+=4) {
    const y = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114);
    d[i]=d[i+1]=d[i+2]=y;
  }
  const th = otsuThreshold(d);
  for (let i=0;i<d.length;i+=4) {
    const v = d[i]>th ? 255:0; d[i]=d[i+1]=d[i+2]=v;
  }
  g.putImageData(id,0,0);
  return c;
}

/* === Importación directa: una línea = una tarea === */
async function importDirect(text) {
  const items = parseShopping(text);
  if (!items.length) {
    await Swal.fire({ icon:'info', title:'No se detectó texto útil', text:'Acércate más y usa buena luz.' });
    return;
  }
  const now = Date.now();
  const newTasks = items.map(name => ({
    id: crypto.randomUUID(),
    name,
    due: null,
    priority: "medium",
    completed: false,
    createdAt: now,
    updatedAt: now
  }));
  tasks = [...newTasks, ...tasks];
  saveTasks(); render();
  Swal.fire({ icon:"success", title:`Importadas ${newTasks.length} tareas`, timer:1200, showConfirmButton:false });
}

/* Parser para listas de la compra */
function parseShopping(input) {
  if (!input) return [];
  const raw = input
    .replace(/\r/g, "\n")
    .replace(/[·•\-–—]+/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/ +/g, " ");

  const parts = raw.split(/\n|[,;]+/g)
    .map(s => s
      .replace(/^\s*[\d]{1,3}[.)]\s*/g, "")
      .replace(/^\s*(x\s*\d+|\d+\s*x)\s*/i, "")
      .replace(/^\s*\d+([.,]\d+)?\s*(kg|g|gr|l|ml|uds?|unidades)\b\.?/i, "")
      .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|l|ml|uds?|unidades)\b\.?/gi, "")
      .replace(/\s+/g, " ").trim()
    )
    .filter(Boolean)
    .filter(s => s.length >= 2)
    .map(s => s.replace(/^[-–—]\s*/, ""));

  const seen = new Set();
  const out = [];
  for (const s of parts) {
    const k = s.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}

// ===== Render =====
function render() {
  // Filtro + búsqueda
  let list = tasks.filter(t => {
    const matchQuery = !ui.query || t.name.toLowerCase().includes(ui.query);
    const matchFilter =
      ui.filter === "all" ||
      (ui.filter === "pending" && !t.completed) ||
      (ui.filter === "completed" && t.completed);
    return matchQuery && matchFilter;
  });

  // Orden
  list.sort((a, b) => {
    switch (ui.sort) {
      case "createdAsc":  return a.createdAt - b.createdAt;
      case "createdDesc": return b.createdAt - a.createdAt;
      case "dueAsc": {
        const ad = a.due ? new Date(a.due).getTime() : Infinity;
        const bd = b.due ? new Date(b.due).getTime() : Infinity;
        return ad - bd;
      }
      case "dueDesc": {
        const ad = a.due ? new Date(a.due).getTime() : -Infinity;
        const bd = b.due ? new Date(b.due).getTime() : -Infinity;
        return bd - ad;
      }
      case "priorityDesc": return priorityWeight[b.priority] - priorityWeight[a.priority];
      case "priorityAsc":  return priorityWeight[a.priority] - priorityWeight[b.priority];
    }
    return 0;
  });

  // Construir filas
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.appendChild(noRow);
    noRow.style.display = "";
  } else {
    noRow.style.display = "none";
    const frag = document.createDocumentFragment();
    for (const t of list) {
      frag.appendChild(rowTemplate(t));
    }
    tbody.appendChild(frag);
  }

  // Contadores
  countTotal.textContent = `Total: ${tasks.length}`;
  countPending.textContent = `Pendientes: ${tasks.filter(t => !t.completed).length}`;
  countDone.textContent = `Completadas: ${tasks.filter(t => t.completed).length}`;
}

// ===== Plantilla de fila (con data-label para móvil) =====
function rowTemplate(t) {
  const tr = document.createElement("tr");
  tr.dataset.id = t.id;
  if (t.completed) tr.classList.add("completed");

  const today = new Date();
  let dueLabel = "—";
  if (t.due) {
    const d = new Date(t.due + "T00:00:00");
    const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
    const isOver = diff < 0 && !t.completed;
    dueLabel = d.toLocaleDateString();
    if (isOver) dueLabel += " ⚠";
  }

  tr.innerHTML = `
    <td class="editable" data-label="Tarea">
      <span class="task-title">${escapeHtml(t.name)}</span>
      <span class="meta">Creada: ${new Date(t.createdAt).toLocaleString()}</span>
    </td>
    <td data-label="Fecha">${t.due ? dueLabel : "—"}</td>
    <td data-label="Prioridad"><span class="badge ${t.priority}">${prioText(t.priority)}</span></td>
    <td data-label="Estado"><span class="state-chip ${t.completed ? "" : "pending"}">${t.completed ? "Completada" : "Pendiente"}</span></td>
    <td class="actions-col" data-label="Acciones">
      <div class="row-actions">
        <button class="btn btn-success" data-action="toggle">${t.completed ? "Desmarcar" : "Completar"}</button>
        <button class="btn btn-edit" data-action="edit">Editar</button>
        <button class="btn btn-danger" data-action="delete">Eliminar</button>
      </div>
    </td>
  `;
  return tr;
}

// ===== Editar tarea (modal) =====
async function editTask(task) {
  const { value: formValues } = await Swal.fire({
    title: "Editar tarea",
    html: `
      <input id="swal-name" class="swal2-input" placeholder="Título" value="${escapeAttr(task.name)}" maxlength="80">
      <input id="swal-due" type="date" class="swal2-input" value="${task.due || ""}">
      <select id="swal-prio" class="swal2-input">
        <option value="high" ${task.priority === "high" ? "selected" : ""}>Alta</option>
        <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Media</option>
        <option value="low" ${task.priority === "low" ? "selected" : ""}>Baja</option>
      </select>
    `,
    focusConfirm: false,
    preConfirm: () => {
      const name = document.getElementById("swal-name").value.trim();
      const due  = document.getElementById("swal-due").value || null;
      const prio = document.getElementById("swal-prio").value;
      if (!name) {
        Swal.showValidationMessage("El título no puede estar vacío");
        return false;
      }
      return { name, due, priority: prio };
    },
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar"
  });

  if (formValues) {
    task.name = formValues.name;
    task.due = formValues.due;
    task.priority = formValues.priority;
    task.updatedAt = Date.now();
    saveTasks(); render();
    Swal.fire({ icon: "success", title: "Cambios guardados", timer: 1200, showConfirmButton: false });
  }
}

// ===== Persistencia =====
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function restoreTheme() {
  const pref = localStorage.getItem(THEME_KEY);
  if (pref === "light") document.documentElement.classList.add("light");
}

// ===== Helpers =====
function prioText(p) { return p === "high" ? "Alta" : p === "low" ? "Baja" : "Media"; }
function escapeHtml(str) { return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function escapeAttr(str) { return escapeHtml(str); }
