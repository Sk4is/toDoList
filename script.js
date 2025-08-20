const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STORAGE_KEY = "todo.tasks.v2";
const THEME_KEY = "todo.theme";

const priorityWeight = { high: 3, medium: 2, low: 1 };

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

let tasks = loadTasks();
let ui = {
  query: "",
  filter: "all",
  sort: "createdDesc",
};

restoreTheme();
render();

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

search.addEventListener("input", () => {
  ui.query = search.value.trim().toLowerCase();
  render();
});
filterStatus.addEventListener("change", () => {
  ui.filter = filterStatus.value;
  render();
});
sortBy.addEventListener("change", () => {
  ui.sort = sortBy.value;
  render();
});

clearCompletedBtn.addEventListener("click", async () => {
  if (!tasks.some((t) => t.completed)) return;
  const res = await Swal.fire({
    title: "Eliminar completadas",
    text: "¿Seguro que quieres eliminar todas las tareas completadas?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí",
    cancelButtonText: "No",
    reverseButtons: true,
  });
  if (res.isConfirmed) {
    tasks = tasks.filter((t) => !t.completed);
    saveTasks();
    render();
    Swal.fire({
      icon: "success",
      title: "Eliminadas",
      timer: 1200,
      showConfirmButton: false,
    });
  }
});

markAllDoneBtn.addEventListener("click", () => {
  const allCompleted = tasks.every((t) => t.completed);
  tasks = tasks.map((t) => ({ ...t, completed: !allCompleted }));
  saveTasks();
  render();
});

themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = tr?.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const action = btn.dataset.action;

  if (action === "toggle") {
    task.completed = !task.completed;
    task.updatedAt = Date.now();
    saveTasks();
    render();
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
      reverseButtons: true,
    });
    if (res.isConfirmed) {
      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      render();
      Swal.fire({
        icon: "success",
        title: "Tarea eliminada",
        timer: 1200,
        showConfirmButton: false,
      });
    }
  }
});

tbody.addEventListener("dblclick", async (e) => {
  const cell = e.target.closest("td.editable");
  if (!cell) return;
  const tr = cell.closest("tr");
  const id = tr.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  await editTask(task);
});

const ocrBtn = $("#ocrBtn");
const ocrInput = $("#ocrInput");

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

ocrBtn.addEventListener("click", async () => {
  await openCameraModal();
});

ocrInput.addEventListener("change", async () => {
  const file = ocrInput.files?.[0];
  if (!file) return;
  const img = await fileToImage(file);
  const text = await runOcrFromImageElement(img, { rotation: 0 });
  await previewAndImport(text);
  ocrInput.value = "";
});

camClose.addEventListener("click", closeCameraModal);
camSwitch.addEventListener("click", async () => {
  usingFacing = usingFacing === "environment" ? "user" : "environment";
  await startCamera();
});
camTorch.addEventListener("click", async () => {
  await toggleTorch();
});
camRotateL.addEventListener("click", () => {
  rotation = (rotation - 90 + 360) % 360;
});
camRotateR.addEventListener("click", () => {
  rotation = (rotation + 90) % 360;
});

camShot.addEventListener("click", async () => {
  if (!camStream) return;
  try {
    const frame = captureFrame({ rotation });
    const text = await runOcrFromCanvas(frame);
    await previewAndImport(text);
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: "error", title: "No se pudo leer la imagen" });
  }
});

async function openCameraModal() {
  rotation = 0;
  torchOn = false;
  cameraModal.hidden = false;
  await startCamera();
}

async function startCamera() {
  stopCamera();
  const constraints = {
    audio: false,
    video: {
      facingMode: usingFacing,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      focusMode: "continuous",
      advanced: [{ focusMode: "continuous" }],
    },
  };
  try {
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    camPreview.srcObject = camStream;

    await setTorch(false);
  } catch (err) {
    console.error(err);
    cameraModal.hidden = true;
    ocrInput.click();
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
}

function closeCameraModal() {
  stopCamera();
  cameraModal.hidden = true;
}

async function toggleTorch() {
  torchOn = !torchOn;
  const ok = await setTorch(torchOn);
  if (!ok) {
    torchOn = false;
    Swal.fire({
      icon: "info",
      title: "Linterna no soportada",
      timer: 1200,
      showConfirmButton: false,
    });
  }
}

async function setTorch(on) {
  try {
    const track = camStream?.getVideoTracks?.()[0];
    if (!track) return false;
    const capabilities = track.getCapabilities?.();
    if (!capabilities || !capabilities.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

function captureFrame({ rotation = 0 } = {}) {
  const video = camPreview;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Video no listo");

  const MAX_SIDE = 2048;
  let cw = vw,
    ch = vh;
  if (Math.max(vw, vh) > MAX_SIDE) {
    const scale = MAX_SIDE / Math.max(vw, vh);
    cw = Math.round(vw * scale);
    ch = Math.round(vh * scale);
  }

  const rot = rotation % 360;
  const rad = (rot * Math.PI) / 180;
  const needsSwap = rot === 90 || rot === 270;
  const W = needsSwap ? ch : cw;
  const H = needsSwap ? cw : ch;

  camCanvas.width = W;
  camCanvas.height = H;
  const ctx = camCanvas.getContext("2d");

  ctx.save();
  if (rot === 90) {
    ctx.translate(W, 0);
  } else if (rot === 180) {
    ctx.translate(W, H);
  } else if (rot === 270) {
    ctx.translate(0, H);
  }
  ctx.rotate(rad);

  const dx = 0,
    dy = 0,
    dw = cw,
    dh = ch;
  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const y = r * 0.299 + g * 0.587 + b * 0.114;
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  const thresh = otsuThreshold(data);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > thresh ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);

  return camCanvas;
}

function otsuThreshold(data) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0,
    wB = 0,
    wF = 0,
    mB = 0,
    mF = 0,
    max = 0,
    between = 0,
    thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    mB = sumB / wB;
    mF = (sum - sumB) / wF;
    between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      thresh = t;
    }
  }
  return thresh;
}

async function runOcrFromCanvas(canvas) {
  showOcrProgress();
  try {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png", 1));
    const { data } = await Tesseract.recognize(blob, "spa+eng", {
      logger: updateOcrProgress,
      tessedit_char_whitelist:
        "abcdefghijklmnñopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúÁÉÍÓÚüÜ0123456789-•·.,;:()[]{} ",
      psm: 6,
    });
    Swal.close();
    return data?.text || "";
  } catch (e) {
    Swal.close();
    throw e;
  }
}

async function runOcrFromImageElement(img, { rotation = 0 } = {}) {
  const temp = document.createElement("canvas");
  const tctx = temp.getContext("2d");
  const w = img.naturalWidth,
    h = img.naturalHeight;

  const MAX = 2048;
  let cw = w,
    ch = h;
  if (Math.max(w, h) > MAX) {
    const sc = MAX / Math.max(w, h);
    cw = Math.round(w * sc);
    ch = Math.round(h * sc);
  }
  const needsSwap = rotation === 90 || rotation === 270;
  temp.width = needsSwap ? ch : cw;
  temp.height = needsSwap ? cw : ch;

  tctx.save();
  if (rotation === 90) {
    tctx.translate(temp.width, 0);
  }
  if (rotation === 180) {
    tctx.translate(temp.width, temp.height);
  }
  if (rotation === 270) {
    tctx.translate(0, temp.height);
  }
  tctx.rotate((rotation * Math.PI) / 180);
  tctx.drawImage(img, 0, 0, cw, ch);
  tctx.restore();

  const ctx = tctx;
  const imgData = ctx.getImageData(0, 0, temp.width, temp.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  const th = otsuThreshold(data);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > th ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);

  return runOcrFromCanvas(temp);
}

function showOcrProgress() {
  Swal.fire({
    title: "Leyendo texto…",
    html: `<div id="ocrProgressText" style="margin-top:8px;color:#8aa4bf">Inicializando</div>
           <div style="height:8px;background:#1a2434;border-radius:6px;margin-top:10px;overflow:hidden">
             <div id="ocrBar" style="height:100%;width:0%;background:#08dcdc;transition:width .2s ease;"></div>
           </div>`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });
}

function updateOcrProgress(m) {
  const text = document.getElementById("ocrProgressText");
  const bar = document.getElementById("ocrBar");
  if (!text || !bar) return;
  if (m.status)
    text.textContent = `${m.status} (${Math.round((m.progress || 0) * 100)}%)`;
  if (typeof m.progress === "number")
    bar.style.width = `${Math.round(m.progress * 100)}%`;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function previewAndImport(text) {
  const lines = parseShopping(text);
  if (!lines.length) {
    await Swal.fire({
      icon: "info",
      title: "No se detectó texto útil",
      text: "Prueba acercándote y con mejor luz.",
    });
    return;
  }

  const listHtml = lines
    .map(
      (t, i) =>
        `<label style="display:flex;align-items:center;gap:8px;margin:6px 0">
      <input type="checkbox" checked data-idx="${i}"> <span>${escapeHtml(
          t
        )}</span>
    </label>`
    )
    .join("");

  const { value: ok } = await Swal.fire({
    title: "Selecciona lo que quieres importar",
    html: `<div style="text-align:left;max-height:300px;overflow:auto;padding-right:6px">${listHtml}</div>`,
    showCancelButton: true,
    confirmButtonText: "Importar",
    cancelButtonText: "Cancelar",
    preConfirm: () => {
      const checks = [
        ...document.querySelectorAll('input[type="checkbox"][data-idx]'),
      ];
      const chosen = checks
        .filter((c) => c.checked)
        .map((c) => lines[+c.dataset.idx]);
      if (!chosen.length) {
        Swal.showValidationMessage("No seleccionaste ningún ítem");
        return false;
      }
      return chosen;
    },
  });

  if (ok && Array.isArray(ok)) {
    const now = Date.now();
    const newTasks = ok.map((name) => ({
      id: crypto.randomUUID(),
      name,
      due: null,
      priority: "medium",
      completed: false,
      createdAt: now,
      updatedAt: now,
    }));
    tasks = [...newTasks, ...tasks];
    saveTasks();
    render();
    Swal.fire({
      icon: "success",
      title: `Importadas ${newTasks.length} tareas`,
      timer: 1300,
      showConfirmButton: false,
    });
  }
}

function parseShopping(input) {
  if (!input) return [];
  const raw = input
    .replace(/\r/g, "\n")
    .replace(/[·•\-–—]+/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/ +/g, " ");

  const parts = raw
    .split(/\n|[,;]+/g)
    .map((s) =>
      s
        .replace(/^\s*[\d]{1,3}[.)]\s*/g, "")
        .replace(/^\s*(x\s*\d+|\d+\s*x)\s*/i, "")
        .replace(/^\s*\d+(\,\d+)?\s*(kg|g|gr|l|ml|uds?|unidades)\b\.?/i, "")
        .replace(/\b\d+(\,\d+)?\s*(kg|g|gr|l|ml|uds?|unidades)\b\.?/gi, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .filter((s) => s.length >= 2)
    .map((s) => s.replace(/^[-–—]\s*/, ""));

  const seen = new Set();
  const result = [];
  for (const s of parts) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      result.push(s);
    }
  }
  return result;
}

function render() {
  let list = tasks.filter((t) => {
    const matchQuery = !ui.query || t.name.toLowerCase().includes(ui.query);
    const matchFilter =
      ui.filter === "all" ||
      (ui.filter === "pending" && !t.completed) ||
      (ui.filter === "completed" && t.completed);
    return matchQuery && matchFilter;
  });

  list.sort((a, b) => {
    switch (ui.sort) {
      case "createdAsc":
        return a.createdAt - b.createdAt;
      case "createdDesc":
        return b.createdAt - a.createdAt;
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
      case "priorityDesc":
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      case "priorityAsc":
        return priorityWeight[a.priority] - priorityWeight[b.priority];
    }
    return 0;
  });

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

  countTotal.textContent = `Total: ${tasks.length}`;
  countPending.textContent = `Pendientes: ${
    tasks.filter((t) => !t.completed).length
  }`;
  countDone.textContent = `Completadas: ${
    tasks.filter((t) => t.completed).length
  }`;
}

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
    <td class="editable">
      <span class="task-title">${escapeHtml(t.name)}</span>
      <span class="meta">Creada: ${new Date(
        t.createdAt
      ).toLocaleString()}</span>
    </td>
    <td>${t.due ? dueLabel : "—"}</td>
    <td><span class="badge ${t.priority}">${prioText(t.priority)}</span></td>
    <td><span class="state-chip ${t.completed ? "" : "pending"}">${
    t.completed ? "Completada" : "Pendiente"
  }</span></td>
    <td class="actions-col">
      <div class="row-actions">
        <button class="btn btn-success" data-action="toggle">${
          t.completed ? "Desmarcar" : "Completar"
        }</button>
        <button class="btn btn-edit" data-action="edit">Editar</button>
        <button class="btn btn-danger" data-action="delete">Eliminar</button>
      </div>
    </td>
  `;
  return tr;
}

async function editTask(task) {
  const { value: formValues } = await Swal.fire({
    title: "Editar tarea",
    html: `
      <input id="swal-name" class="swal2-input" placeholder="Título" value="${escapeAttr(
        task.name
      )}" maxlength="80">
      <input id="swal-due" type="date" class="swal2-input" value="${
        task.due || ""
      }">
      <select id="swal-prio" class="swal2-input">
        <option value="high" ${
          task.priority === "high" ? "selected" : ""
        }>Alta</option>
        <option value="medium" ${
          task.priority === "medium" ? "selected" : ""
        }>Media</option>
        <option value="low" ${
          task.priority === "low" ? "selected" : ""
        }>Baja</option>
      </select>
    `,
    focusConfirm: false,
    preConfirm: () => {
      const name = document.getElementById("swal-name").value.trim();
      const due = document.getElementById("swal-due").value || null;
      const prio = document.getElementById("swal-prio").value;
      if (!name) {
        Swal.showValidationMessage("El título no puede estar vacío");
        return false;
      }
      return { name, due, priority: prio };
    },
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
  });

  if (formValues) {
    task.name = formValues.name;
    task.due = formValues.due;
    task.priority = formValues.priority;
    task.updatedAt = Date.now();
    saveTasks();
    render();
    Swal.fire({
      icon: "success",
      title: "Cambios guardados",
      timer: 1200,
      showConfirmButton: false,
    });
  }
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function restoreTheme() {
  const pref = localStorage.getItem(THEME_KEY);
  if (pref === "light") document.documentElement.classList.add("light");
}

function prioText(p) {
  return p === "high" ? "Alta" : p === "low" ? "Baja" : "Media";
}
function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
function escapeAttr(str) {
  return escapeHtml(str);
}

/**
 * parseLines
 * Normaliza el texto OCR en una lista de ítems (una línea por tarea).
 * - Divide por saltos de línea y separadores comunes (, ; • - * ·)
 * - Limpia viñetas y numeración
 * - Quita vacíos, muy cortos y duplicados secuenciales
 */
function parseLines(input) {
  if (!input) return [];
  const SEP = /[\n,;]+/g;
  const rawParts = input
    .replace(/\r/g, "\n")
    .split(SEP)
    .flatMap((p) => p.split(/(?:•|·|–|-|\*)/g));

  const cleaned = rawParts
    .map((s) =>
      s
        .replace(/^\s*[\d]{1,3}[.)\]]\s*/g, "")
        .replace(/^\s*(?:•|·|–|-|\*)\s*/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((s) => s.length >= 2);

  const deduped = [];
  for (const s of cleaned) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== s.toLowerCase()) {
      deduped.push(s);
    }
  }
  return deduped;
}
