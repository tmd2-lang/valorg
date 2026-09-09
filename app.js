/* ============================================================
   VALORG — app logic

   Same four ideas as before, with one thing changed:

     1. STATE    — an array of project objects, held in memory
     2. STORAGE  — now a database on Supabase's computers, not this browser
     3. ROUTER   — the URL hash decides which view is on screen
     4. RENDER   — a function that draws the screen from the state

   Because storage moved off this machine, saving now takes time. The
   pattern used throughout:

       change `projects` -> render() immediately -> tell the server

   The screen updates the instant you click, and the save happens behind
   it. If the save fails, we say so and reload the truth from the server.
   ============================================================ */


/* ---------- CONNECT ---------- */

// `supabase` (lowercase) is the library loaded from the CDN in index.html.
// `db` is our connection to your particular project.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* ---------- 1. STATE ---------- */

/**
 * @type {Array<{
 *   id: string, name: string, note: string, status: string, createdAt: number,
 *   tasks: Array<{id: string, title: string, done: boolean, createdAt: number}>
 * }>}
 */
let projects = [];

let user = null;          // the signed-in account, or null
let editingId = null;     // project being edited in the dialog, or null


/* ---------- ELEMENTS ---------- */

const $ = id => document.getElementById(id);

const booting  = $('booting');
const authView = $('authView');
const appView  = $('appView');
const banner   = $('banner');

const listView   = $('listView');
const detailView = $('detailView');
const grid       = $('grid');
const empty      = $('empty');
const countEl    = $('count');
const addBtnTop  = $('addBtnTop');
const account      = $('account');
const accountEmail = $('accountEmail');

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

const importBar  = $('importBar');
const importText = $('importText');


/* ---------- MESSAGES ---------- */

let bannerTimer = null;

function say(message, kind = 'info') {
  clearTimeout(bannerTimer);
  banner.textContent = message;
  banner.className   = `banner banner-${kind}`;
  banner.hidden      = !message;

  // Good news disappears on its own; problems stay put.
  if (message && kind === 'info') {
    bannerTimer = setTimeout(() => { banner.hidden = true; }, 2500);
  }
}


/* ---------- 2. STORAGE (the database) ---------- */

/* The table stores `created_at`; the app has always called it `createdAt`.
   These two functions translate between the two shapes so the rest of the
   code never has to think about it. */

function fromRow(row) {
  return {
    id:        row.id,
    name:      row.name,
    note:      row.note ?? '',
    status:    row.status,
    tasks:     Array.isArray(row.tasks) ? row.tasks : [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function loadProjects() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    say(`Could not load your projects: ${error.message}`, 'error');
    return false;
  }

  projects = data.map(fromRow);
  return true;
}

/* Every write goes through here. It runs the database call, and if the call
   fails it pulls the real data back down so the screen can't keep showing a
   change that never actually saved. */
async function push(work) {
  const { error } = await work();
  if (!error) return true;

  say(`Not saved: ${error.message}`, 'error');
  await loadProjects();
  render();
  return false;
}


/* ---------- 3. ROUTER ---------- */

/* Two routes:
     #/           the list of all projects
     #/p/<id>     one project's detail page */

function currentRoute() {
  const match = location.hash.match(/^#\/p\/(.+)$/);
  return match ? { view: 'detail', id: match[1] } : { view: 'list' };
}

function go(hash) {
  if (location.hash !== hash) location.hash = hash;
  render();                       // draw now; don't wait on the event
}

// Covers the browser's back and forward buttons.
window.addEventListener('hashchange', render);


/* ---------- 4. RENDER ---------- */

function render() {
  // Signed out: only the sign-in screen exists.
  if (!user) {
    booting.hidden  = true;
    authView.hidden = false;
    appView.hidden  = true;
    account.hidden  = true;
    addBtnTop.hidden = true;
    countEl.hidden   = true;
    return;
  }

  booting.hidden  = true;
  authView.hidden = true;
  appView.hidden  = false;
  account.hidden  = false;
  accountEmail.textContent = user.email;

  const route = currentRoute();
  const project = route.view === 'detail'
    ? projects.find(p => p.id === route.id)
    : null;

  // A link to a project that's gone falls back to the list.
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

async function submitProject() {
  const name = fName.value.trim();
  if (!name) return;                       // `required` already guards this

  const fields = {
    name,
    note:   fNote.value.trim(),
    status: fStatus.value,
  };
  const id = editingId;
  editingId = null;

  if (id) {
    // Editing: update on screen first, then save.
    projects = projects.map(p => (p.id === id ? { ...p, ...fields } : p));
    render();
    await push(() => db.from('projects').update(fields).eq('id', id));
    return;
  }

  // Creating: the database makes the id, so wait for the row to come back.
  const { data, error } = await db
    .from('projects')
    .insert({ ...fields, tasks: [] })
    .select()
    .single();

  if (error) { say(`Could not create: ${error.message}`, 'error'); return; }

  projects.push(fromRow(data));
  render();
}

async function removeProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;

  const extra = p.tasks.length ? ` and its ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}` : '';
  if (!confirm(`Delete "${p.name}"${extra}?`)) return;

  projects = projects.filter(x => x.id !== id);

  // If we were looking at it, go back to the list; otherwise just redraw.
  if (currentRoute().id === id) go('#/');
  else render();

  await push(() => db.from('projects').delete().eq('id', id));
}


/* ---------- TASK ACTIONS ---------- */

/* Tasks live in a JSON column on the project row, so each of these builds
   the new task list, shows it, then saves the whole list back. */

async function saveTasks(projectId, tasks) {
  projects = projects.map(p => (p.id === projectId ? { ...p, tasks } : p));
  render();
  await push(() => db.from('projects').update({ tasks }).eq('id', projectId));
}

function addTask(projectId, title) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  saveTasks(projectId, [
    ...p.tasks,
    { id: crypto.randomUUID(), title, done: false, createdAt: Date.now() },
  ]);
}

function toggleTask(projectId, taskId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  saveTasks(projectId, p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
}

function removeTask(projectId, taskId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  saveTasks(projectId, p.tasks.filter(t => t.id !== taskId));
}


/* ---------- BRINGING OVER OLD BROWSER DATA ---------- */

/* Projects made before this app had accounts are still sitting in this
   browser's own storage. Offer to move them up to the database once. */

const OLD_KEY    = 'valorg.projects.v1';
const BACKUP_KEY = 'valorg.projects.imported-backup';

function localLeftovers() {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function offerImport() {
  const found = localLeftovers();
  if (!found.length) { importBar.hidden = true; return; }

  importText.textContent =
    `${found.length} project${found.length === 1 ? '' : 's'} saved in this browser from before you had an account.`;
  importBar.hidden = false;
}

async function runImport() {
  const found = localLeftovers();
  if (!found.length) return;

  const rows = found.map(p => ({
    name:   p.name,
    note:   p.note ?? '',
    status: p.status ?? 'active',
    tasks:  Array.isArray(p.tasks) ? p.tasks : [],
  }));

  const { data, error } = await db.from('projects').insert(rows).select();
  if (error) { say(`Import failed: ${error.message}`, 'error'); return; }

  // Keep the old copy under a different name rather than deleting it.
  try {
    localStorage.setItem(BACKUP_KEY, localStorage.getItem(OLD_KEY));
    localStorage.removeItem(OLD_KEY);
  } catch {}

  projects.push(...data.map(fromRow));
  importBar.hidden = true;
  say(`Imported ${data.length} project${data.length === 1 ? '' : 's'}.`);
  render();
}


/* ---------- AUTH ---------- */

async function sendMagicLink(email) {
  const btn = $('authBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin },
  });

  btn.disabled = false;
  btn.textContent = 'Email me a link';

  if (error) { say(error.message, 'error'); return; }

  $('authNote').textContent =
    `Check ${email} for a link. It signs you in when you click it.`;
  $('authNote').className = 'auth-note auth-note-sent';
}

/* Supabase reports the existing session on startup, and start() below also
   asks for it — so without this guard the same sign-in would load twice. */
let setUpFor = null;

async function onSignedIn(session) {
  if (setUpFor === session.user.id) return;
  setUpFor = session.user.id;

  user = session.user;
  await loadProjects();
  offerImport();
  render();
}

function onSignedOut() {
  setUpFor = null;
  user = null;
  projects = [];
  render();
}


/* ---------- WIRING ---------- */

addBtnTop.addEventListener('click',        () => openDialog());
$('addBtnEmpty').addEventListener('click', () => openDialog());
$('cancelBtn').addEventListener('click',   () => dialog.close());

// The form is method="dialog", so the browser closes the dialog for us on submit.
form.addEventListener('submit', submitProject);

// Enter submits from the name field; Cmd/Ctrl+Enter submits from the textarea.
fName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
});
fNote.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
});

dialog.addEventListener('close', () => { editingId = null; });

// The back link keeps its href (right-click and open-in-new-tab still work)
// but navigates through go(), which renders immediately.
document.querySelector('.back').addEventListener('click', e => {
  e.preventDefault();
  go('#/');
});

$('dEdit').addEventListener('click',   () => openDialog(currentRoute().id));
$('dDelete').addEventListener('click', () => removeProject(currentRoute().id));

taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;
  addTask(currentRoute().id, title);
  taskInput.value = '';
  taskInput.focus();
});

$('authForm').addEventListener('submit', e => {
  e.preventDefault();
  sendMagicLink($('authEmail').value.trim());
});

$('signOutBtn').addEventListener('click', () => db.auth.signOut());

$('importYes').addEventListener('click', runImport);
$('importNo').addEventListener('click',  () => { importBar.hidden = true; });

// Keyboard shortcut: "n" for new project (list view only).
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'n' && !typing && !dialog.open && !e.metaKey && !e.ctrlKey
      && user && currentRoute().view === 'list') {
    e.preventDefault();
    openDialog();
  }
});


/* ---------- START ---------- */

/* Fires on first load, after a magic-link click, and on sign out. */
db.auth.onAuthStateChange((event, session) => {
  if (session?.user) onSignedIn(session);
  else onSignedOut();
});

(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) await onSignedIn(session);
  else onSignedOut();
})();
