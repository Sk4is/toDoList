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

const ocrBtn = $("#ocrBtn");
const ocrInput = $("#ocrInput");

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

tbody.addEventListener("dblclick", async (e) => {
  const cell = e.target.closest("td.editable");
  if (!cell) return;
  const tr = cell.closest("tr");
  const id = tr.dataset.id;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  await editTask(task);
});

ocrBtn.addEventListener("click", () => ocrInput.click());
ocrInput.addEventListener("change", async () => {
  const file = ocrInput.files?.[0];
  if (!file) return;

  let lastPct = 0;
  await Swal.fire({
    title: "Analizando imagen…",
    html: `<div id="ocrProgressText" style="margin-top:8px;color:#8aa4bf">Inicializando</div>
           <div style="height:8px;background:#1a2434;border-radius:6px;margin-top:10px;overflow:hidden">
             <div id="ocrBar" style="height:100%;width:0%;background:#08dcdc;transition:width .2s ease;"></div>
           </div>`,
    allowOutsideClick: false,
    didOpen: async () => {
      Swal.showLoading();

      try {
        const { data } = await Tesseract.recognize(file, 'eng', {
          logger: m => {
            if (m.status && typeof m.progress === 'number') {
              const pct = Math.round(m.progress * 100);
              if (pct !== lastPct) {
                lastPct = pct;
                const text = document.getElementById('ocrProgressText');
                const bar = document.getElementById('ocrBar');
                if (text) text.textContent = `${m.status} (${pct}%)`;
                if (bar) bar.style.width = `${pct}%`;
              }
            }
          }
        });

        Swal.close();

        const raw = (data && data.text) ? data.text : '';
        const lines = parseLines(raw);
        if (!lines.length) {
          await Swal.fire({ icon: 'info', title: 'No se detectó texto', text: 'Prueba con una foto más nítida y con buena luz.' });
          ocrInput.value = '';
          return;
        }

        const { value: edited } = await Swal.fire({
          title: "Revisa y edita",
          html: `<p style="margin:0 0 6px;color:#8aa4bf">Cada línea será una tarea. Puedes editar, borrar o añadir líneas.</p>
                 <textarea id="ocrTextarea" class="swal2-textarea" style="height:240px">${lines.join('\n')}</textarea>`,
          focusConfirm: false,
          showCancelButton: true,
          confirmButtonText: "Importar",
          cancelButtonText: "Cancelar",
          preConfirm: () => {
            const ta = document.getElementById('ocrTextarea');
            const list = parseLines(ta.value || '');
            if (!list.length) {
              Swal.showValidationMessage("No hay líneas válidas");
              return false;
            }
            return list;
          }
        });

        if (edited && Array.isArray(edited)) {
          const newTasks = edited.map(name => ({
            id: crypto.randomUUID(),
            name,
            due: null,
            priority: "medium",
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
          tasks = [...newTasks, ...tasks];
          saveTasks();
          render();
          Swal.fire({ icon: "success", title: `Importadas ${newTasks.length} tareas`, timer: 1400, showConfirmButton: false });
        }
      } catch (err) {
        console.error(err);
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Error al leer la imagen', text: 'Vuelve a intentarlo o usa otra foto.' });
      } finally {
        ocrInput.value = '';
      }
    }
  });
});

function render() {
  let list = tasks.filter(t => {
    const matchQuery = !ui.query || t.name.toLowerCase().includes(ui.query);
    const matchFilter =
      ui.filter === "all" ||
      (ui.filter === "pending" && !t.completed) ||
      (ui.filter === "completed" && t.completed);
    return matchQuery && matchFilter;
  });

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
  countPending.textContent = `Pendientes: ${tasks.filter(t => !t.completed).length}`;
  countDone.textContent = `Completadas: ${tasks.filter(t => t.completed).length}`;
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
      <span class="meta">Creada: ${new Date(t.createdAt).toLocaleString()}</span>
    </td>
    <td>${t.due ? dueLabel : "—"}</td>
    <td><span class="badge ${t.priority}">${prioText(t.priority)}</span></td>
    <td><span class="state-chip ${t.completed ? "" : "pending"}">${t.completed ? "Completada" : "Pendiente"}</span></td>
    <td class="actions-col">
      <div class="row-actions">
        <button class="btn btn-success" data-action="toggle">${t.completed ? "Desmarcar" : "Completar"}</button>
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

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
  return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }

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
    .flatMap(p => p.split(/(?:•|·|–|-|\*)/g));

  const cleaned = rawParts
    .map(s => s
      .replace(/^\s*[\d]{1,3}[.)\]]\s*/g, "")
      .replace(/^\s*(?:•|·|–|-|\*)\s*/g, "")
      .replace(/\s+/g, " ")
      .trim()
    )
    .filter(s => s.length >= 2);

  const deduped = [];
  for (const s of cleaned) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== s.toLowerCase()) {
      deduped.push(s);
    }
  }
  return deduped;
}
