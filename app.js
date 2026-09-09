/* ============================================================
   VALORG — app logic

   The whole app is three ideas:
     1. STATE    — an array of project objects, the single source of truth
     2. STORAGE  — that array saved to localStorage so it survives reload
     3. RENDER   — a function that draws the screen from the state

   Rule that keeps this simple: never edit the DOM directly to change
   data. Change `projects`, call save(), call render(). Always.
   ============================================================ */


/* ---------- 1. STATE ---------- */

const STORAGE_KEY = 'valorg.projects.v1';

/** @type {Array<{id:string, name:string, note:string, status:string, createdAt:number}>} */
let projects = load();

// When we're editing an existing project this holds its id. null = creating new.
let editingId = null;


/* ---------- 2. STORAGE ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // Corrupt or blocked storage — start clean rather than crash.
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Private browsing can block writes. Not fatal — the page still works.
  }
}


/* ---------- ELEMENTS ---------- */

const grid        = document.getElementById('grid');
const empty       = document.getElementById('empty');
const countEl     = document.getElementById('count');
const dialog      = document.getElementById('dialog');
const form        = document.getElementById('form');
const dialogTitle = document.getElementById('dialogTitle');
const saveBtn     = document.getElementById('saveBtn');
const fName       = document.getElementById('fName');
const fNote       = document.getElementById('fNote');
const fStatus     = document.getElementById('fStatus');


/* ---------- 3. RENDER ---------- */

function render() {
  // Newest first.
  const sorted = [...projects].sort((a, b) => b.createdAt - a.createdAt);

  grid.replaceChildren();          // clear whatever was there
  sorted.forEach(p => grid.append(cardFor(p)));

  empty.hidden  = projects.length > 0;
  countEl.textContent = projects.length
    ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
    : '';
}

/** Build one project card. Returns a DOM node. */
function cardFor(p) {
  const card = el('article', 'card');

  const head = el('div', 'card-head');
  const name = el('h3', 'card-name', p.name);

  const tools = el('div', 'card-tools');
  tools.append(
    iconBtn('Edit',   '✎', () => openDialog(p.id)),
    iconBtn('Delete', '✕', () => remove(p.id), true)
  );

  head.append(name, tools);
  card.append(head);

  if (p.note) card.append(el('p', 'card-note', p.note));

  const foot = el('div', 'card-foot');
  foot.append(
    el('span', `dot dot-${p.status}`),
    el('span', 'card-status', p.status),
    el('span', 'card-date', formatDate(p.createdAt))
  );
  card.append(foot);

  return card;
}

/* Small DOM helpers — these just save repetition above. */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;  // textContent, never innerHTML
  return node;
}

function iconBtn(label, glyph, onClick, danger = false) {
  const b = el('button', 'icon-btn' + (danger ? ' danger' : ''), glyph);
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}


/* ---------- ACTIONS ---------- */

function openDialog(id = null) {
  editingId = id;

  if (id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    dialogTitle.textContent = 'Edit project';
    saveBtn.textContent     = 'Save';
    fName.value   = p.name;
    fNote.value   = p.note;
    fStatus.value = p.status;
  } else {
    dialogTitle.textContent = 'New project';
    saveBtn.textContent     = 'Create';
    form.reset();
    fStatus.value = 'active';
  }

  dialog.showModal();
  fName.focus();
}

function submit(event) {
  const name = fName.value.trim();
  if (!name) return;                       // `required` already guards this

  const fields = {
    name,
    note:   fNote.value.trim(),
    status: fStatus.value,
  };

  if (editingId) {
    projects = projects.map(p => (p.id === editingId ? { ...p, ...fields } : p));
  } else {
    projects.push({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...fields,
    });
  }

  editingId = null;
  save();
  render();
}

function remove(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.name}"?`)) return;

  projects = projects.filter(x => x.id !== id);
  save();
  render();
}


/* ---------- WIRING ---------- */

document.getElementById('addBtnTop').addEventListener('click',   () => openDialog());
document.getElementById('addBtnEmpty').addEventListener('click', () => openDialog());
document.getElementById('cancelBtn').addEventListener('click',   () => dialog.close());

// The form is method="dialog", so the browser closes the dialog for us on submit.
form.addEventListener('submit', submit);

// Enter submits from the name field; Cmd/Ctrl+Enter submits from the textarea.
// (A plain Enter inside a <textarea> should still insert a newline.)
fName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
});
fNote.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
});

// Reset edit state if the dialog closes any other way (Esc, backdrop).
dialog.addEventListener('close', () => { editingId = null; });

// Keyboard shortcut: "n" for new project.
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'n' && !typing && !dialog.open && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    openDialog();
  }
});

render();
