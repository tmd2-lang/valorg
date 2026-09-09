/* ============================================================
   VALORG — app logic

   The whole app is four ideas:
     1. STATE    — an array of project objects, the single source of truth
     2. STORAGE  — that array saved to localStorage so it survives reload
     3. ROUTER   — the URL hash decides which view is on screen
     4. RENDER   — a function that draws the screen from the state

   Rule that keeps this simple: never edit the DOM directly to change
   data. Change `projects`, call save(), call render(). Always.
   ============================================================ */


/* ---------- 1. STATE ---------- */

const STORAGE_KEY = 'valorg.projects.v1';

/**
 * @type {Array<{
 *   id: string, name: string, note: string, status: string, createdAt: number,
 *   tasks: Array<{id: string, title: string, done: boolean, createdAt: number}>
 * }>}
 */
let projects = load();

// When we're editing an existing project this holds its id. null = creating new.
let editingId = null;


/* ---------- 2. STORAGE ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    // Projects saved before tasks existed have no `tasks` key. Give them an
    // empty one on the way in so the rest of the code never has to check.
    // Do this for any field you add later — old saved data must keep working.
    return parsed.map(p => ({
      ...p,
      tasks: Array.isArray(p.tasks) ? p.tasks : [],
    }));
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

const $ = id => document.getElementById(id);

const listView   = $('listView');
const detailView = $('detailView');
const grid       = $('grid');
const empty      = $('empty');
const countEl    = $('count');
const addBtnTop  = $('addBtnTop');

const dName    = $('dName');
const dNote    = $('dNote');
const dStatus  = $('dStatus');
const taskList = $('taskList');
const taskForm = $('taskForm');
const taskInput  = $('taskInput');
const taskCount  = $('taskCount');
const tasksEmpty = $('tasksEmpty');

const dialog      = $('dialog');
const form        = $('form');
const dialogTitle = $('dialogTitle');
const saveBtn     = $('saveBtn');
const fName       = $('fName');
const fNote       = $('fNote');
const fStatus     = $('fStatus');


/* ---------- 3. ROUTER ---------- */

/* Two routes:
     #/           the list of all projects
     #/p/<id>     one project's detail page
   Using the hash means the browser's back button works for free, and it
   still works as a plain static file with no server routing rules. */

function currentRoute() {
  const match = location.hash.match(/^#\/p\/(.+)$/);
  return match ? { view: 'detail', id: match[1] } : { view: 'list' };
}

function go(hash) {
  const changed = location.hash !== hash;
  if (changed) location.hash = hash;   // updates the URL and history
  render();                            // draw now; don't wait on the event
}

// Covers the browser's back and forward buttons, which change the hash
// without going through go().
window.addEventListener('hashchange', render);


/* ---------- 4. RENDER ---------- */

function render() {
  const route = currentRoute();
  const project = route.view === 'detail'
    ? projects.find(p => p.id === route.id)
    : null;

  // A detail link for a deleted project falls back to the list.
  if (route.view === 'detail' && !project) return go('#/');

  const onDetail = Boolean(project);
  listView.hidden   = onDetail;
  detailView.hidden = !onDetail;
  addBtnTop.hidden  = onDetail;   // "Add project" belongs to the list view
  countEl.hidden    = onDetail;

  if (onDetail) renderDetail(project);
  else renderList();
}

function renderList() {
  const sorted = [...projects].sort((a, b) => b.createdAt - a.createdAt);

  grid.replaceChildren();
  sorted.forEach(p => grid.append(cardFor(p)));

  empty.hidden = projects.length > 0;
  countEl.textContent = projects.length
    ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
    : '';
}

function renderDetail(p) {
  dName.textContent = p.name;
  dNote.textContent = p.note;
  dNote.hidden      = !p.note;

  dStatus.textContent = p.status;
  dStatus.className   = `pill pill-${p.status}`;

  const open = p.tasks.filter(t => !t.done).length;
  const done = p.tasks.length - open;

  taskCount.textContent = p.tasks.length
    ? (open ? `${open} open · ${done} done` : `all ${p.tasks.length} done`)
    : '';

  // Open tasks first, each group newest-first.
  const sorted = [...p.tasks].sort((a, b) =>
    (a.done - b.done) || (b.createdAt - a.createdAt));

  taskList.replaceChildren();
  sorted.forEach(t => taskList.append(taskRow(p, t)));

  tasksEmpty.hidden = p.tasks.length > 0;
}


/* ---------- BUILDING NODES ---------- */

/** Build one project card. Returns a DOM node. */
function cardFor(p) {
  const card = el('article', 'card');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');

  const openIt = () => go(`#/p/${p.id}`);
  card.addEventListener('click', openIt);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); }
  });

  const head  = el('div', 'card-head');
  const name  = el('h3', 'card-name', p.name);
  const tools = el('div', 'card-tools');

  // stopPropagation, or these clicks would also open the card.
  tools.append(
    iconBtn('Edit',   '✎', e => { e.stopPropagation(); openDialog(p.id); }),
    iconBtn('Delete', '✕', e => { e.stopPropagation(); removeProject(p.id); }, true)
  );

  head.append(name, tools);
  card.append(head);

  if (p.note) card.append(el('p', 'card-note', p.note));

  const openCount = p.tasks.filter(t => !t.done).length;

  const foot = el('div', 'card-foot');
  foot.append(
    el('span', `dot dot-${p.status}`),
    el('span', 'card-status', p.status)
  );
  if (openCount) foot.append(el('span', 'card-tasks', `${openCount} open`));
  foot.append(el('span', 'card-date', formatDate(p.createdAt)));

  card.append(foot);
  return card;
}

/** Build one task row. */
function taskRow(project, task) {
  const li = el('li', 'task' + (task.done ? ' task-done' : ''));

  const label = el('label', 'task-label');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'task-box';
  box.checked = task.done;
  box.addEventListener('change', () => toggleTask(project.id, task.id));

  label.append(box, el('span', 'task-title', task.title));

  li.append(
    label,
    iconBtn('Delete task', '✕', () => removeTask(project.id, task.id), true)
  );
  return li;
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


/* ---------- PROJECT ACTIONS ---------- */

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

function submitProject() {
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
      tasks: [],
      ...fields,
    });
  }

  editingId = null;
  save();
  render();
}

function removeProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;

  const extra = p.tasks.length ? ` and its ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}` : '';
  if (!confirm(`Delete "${p.name}"${extra}?`)) return;

  projects = projects.filter(x => x.id !== id);
  save();

  // If we were looking at it, the router will bounce us back to the list.
  if (currentRoute().id === id) go('#/');
  else render();
}


/* ---------- TASK ACTIONS ---------- */

/* Each of these finds the project, produces a NEW tasks array, then saves
   and re-renders. Building a new array instead of mutating the old one is
   the habit that makes state changes easy to follow. */

function addTask(projectId, title) {
  projects = projects.map(p => p.id !== projectId ? p : {
    ...p,
    tasks: [...p.tasks, { id: crypto.randomUUID(), title, done: false, createdAt: Date.now() }],
  });
  save();
  render();
}

function toggleTask(projectId, taskId) {
  projects = projects.map(p => p.id !== projectId ? p : {
    ...p,
    tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t),
  });
  save();
  render();
}

function removeTask(projectId, taskId) {
  projects = projects.map(p => p.id !== projectId ? p : {
    ...p,
    tasks: p.tasks.filter(t => t.id !== taskId),
  });
  save();
  render();
}


/* ---------- WIRING ---------- */

addBtnTop.addEventListener('click',        () => openDialog());
$('addBtnEmpty').addEventListener('click', () => openDialog());
$('cancelBtn').addEventListener('click',   () => dialog.close());

// The form is method="dialog", so the browser closes the dialog for us on submit.
form.addEventListener('submit', submitProject);

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

// The back link keeps its href (so right-click / open-in-new-tab still work)
// but navigates through go(), which renders immediately instead of waiting
// on a hashchange event.
document.querySelector('.back').addEventListener('click', e => {
  e.preventDefault();
  go('#/');
});

// Detail-view header buttons act on whichever project is open.
$('dEdit').addEventListener('click',   () => openDialog(currentRoute().id));
$('dDelete').addEventListener('click', () => removeProject(currentRoute().id));

// Add a task. The form's own submit handles both Enter and the Add button.
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;
  addTask(currentRoute().id, title);
  taskInput.value = '';
  taskInput.focus();
});

// Keyboard shortcut: "n" for new project (list view only).
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'n' && !typing && !dialog.open && !e.metaKey && !e.ctrlKey
      && currentRoute().view === 'list') {
    e.preventDefault();
    openDialog();
  }
});

render();
