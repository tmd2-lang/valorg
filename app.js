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
    tasks:     (Array.isArray(row.tasks) ? row.tasks : []).map(fillInTask),
    createdAt: new Date(row.created_at).getTime(),
  };
}

/* Tasks saved before notes, due dates and history existed are missing those
   fields. Rather than rewrite old rows, fill the gaps on the way in — and
   build a history for them out of what we do know. */
function fillInTask(t) {
  let events = Array.isArray(t.events) ? t.events : null;

  if (!events) {
    events = [{ type: 'created', at: t.createdAt }];
    if (t.done && t.completedAt) events.push({ type: 'completed', at: t.completedAt });
  }

  return {
    completedAt: null,
    due:   null,
    notes: '',
    ...t,
    events,
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

  // Open tasks first, newest added at the top. Finished ones below,
  // most recently finished first — so the last thing you ticked leads.
  const sorted = [...p.tasks].sort((a, b) =>
    (a.done - b.done) ||
    (a.done ? (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt)
            : b.createdAt - a.createdAt));

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

  // The title opens the task; the checkbox next to it does not.
  const title = el('button', 'task-title', task.title);
  title.type = 'button';
  title.addEventListener('click', () => openTaskDialog(project.id, task.id));

  label.append(box);
  li.append(label, title);

  if (task.notes) {
    const mark = el('span', 'task-hasnotes', '✎');
    mark.title = 'Has notes';
    li.append(mark);
  }

  if (task.due) li.append(dueBadge(task.due, task.done));

  // A done task shows when it was finished; an open one shows how long
  // it has been sitting there. Hovering gives the exact dates for both.
  const when = el('span', 'task-when', task.done
    ? (task.completedAt ? `done ${ago(task.completedAt)}` : 'done')
    : `added ${ago(task.createdAt)}`);

  when.title = `Added ${fullDate(task.createdAt)}`
    + (task.completedAt ? `\nDone  ${fullDate(task.completedAt)}` : '');

  li.append(
    when,
    iconBtn('Delete task', '✕', () => removeTask(project.id, task.id), true)
  );
  return li;
}

/* Due dates are stored as plain 'YYYY-MM-DD' — a calendar day, not a moment
   in time, so it can't drift across timezones. */

function dueBadge(due, done) {
  const days = daysUntil(due);

  let text = dueLabel(due, days);
  let tone = '';
  if (!done) {
    if (days < 0)       tone = ' due-late';
    else if (days === 0) tone = ' due-today';
    else if (days <= 3)  tone = ' due-soon';
  }

  const badge = el('span', 'due' + tone, text);
  badge.title = `Due ${new Date(due + 'T00:00').toLocaleDateString(undefined, { dateStyle: 'full' })}`;
  return badge;
}

function dueLabel(due, days) {
  if (days === 0)  return 'due today';
  if (days === 1)  return 'due tomorrow';
  if (days === -1) return '1 day late';
  if (days < 0)    return `${-days} days late`;
  if (days <= 6)   return `due in ${days}d`;
  return 'due ' + new Date(due + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysUntil(due) {
  const target = new Date(due + 'T00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
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

/** "just now", "20m ago", "3h ago", "2d ago", then falls back to a date. */
function ago(ts) {
  if (!ts) return '';
  const seconds = (Date.now() - ts) / 1000;

  if (seconds < 60)  return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)      return `${days}d ago`;

  return formatDate(ts);
}

/** The full date and time, for the hover tooltip. */
function fullDate(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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
  const now = Date.now();
  saveTasks(projectId, [
    ...p.tasks,
    {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: now,
      completedAt: null,
      due: null,
      notes: '',
      events: [{ type: 'created', at: now }],
    },
  ]);
}

function toggleTask(projectId, taskId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;

  const at = Date.now();

  saveTasks(projectId, p.tasks.map(t => {
    if (t.id !== taskId) return t;
    const done = !t.done;
    return {
      ...t,
      done,
      // completedAt is "when it was last finished" and drives sorting;
      // events keeps the full story, reopenings included.
      completedAt: done ? at : null,
      events: [...t.events, { type: done ? 'completed' : 'reopened', at }],
    };
  }));
}

function removeTask(projectId, taskId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  saveTasks(projectId, p.tasks.filter(t => t.id !== taskId));
}


/* ---------- THE TASK DIALOG ---------- */

const taskDialog = $('taskDialog');
const tTitle   = $('tTitle');
const tDue     = $('tDue');
const tNotes   = $('tNotes');
const tHistory = $('tHistory');

// Which task the dialog is currently showing.
let openTask = { projectId: null, taskId: null };

function openTaskDialog(projectId, taskId) {
  const p = projects.find(x => x.id === projectId);
  const t = p?.tasks.find(x => x.id === taskId);
  if (!t) return;

  openTask = { projectId, taskId };

  tTitle.value = t.title;
  tDue.value   = t.due ?? '';
  tNotes.value = t.notes ?? '';

  renderHistory(t);
  taskDialog.showModal();
  tTitle.focus();
}

function renderHistory(task) {
  const wording = {
    created:   'Added',
    completed: 'Completed',
    reopened:  'Reopened',
  };

  // Newest at the top — the recent story is usually the one you want.
  const events = [...task.events].sort((a, b) => b.at - a.at);

  tHistory.replaceChildren();
  events.forEach(e => {
    const li = el('li', `hist hist-${e.type}`);
    li.append(
      el('span', 'hist-dot'),
      el('span', 'hist-what', wording[e.type] ?? e.type),
      el('span', 'hist-when', fullDate(e.at))
    );
    tHistory.append(li);
  });
}

function saveTaskDialog() {
  const { projectId, taskId } = openTask;
  const p = projects.find(x => x.id === projectId);
  if (!p) return;

  const title = tTitle.value.trim();
  if (!title) return;

  saveTasks(projectId, p.tasks.map(t => t.id !== taskId ? t : {
    ...t,
    title,
    due:   tDue.value || null,
    notes: tNotes.value.trim(),
  }));
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

/* The sign-in screen does double duty: 'signin' for an account that exists,
   'signup' for making a new one. Same two boxes either way. */
let authMode = 'signin';

const authBtn      = $('authBtn');
const authSub      = $('authSub');
const authNote     = $('authNote');
const authSwitch   = $('authSwitch');
const authEmail    = $('authEmail');
const authPassword = $('authPassword');

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';

  authSub.textContent      = signingUp ? 'Create your account.' : 'Sign in to get to your projects.';
  authBtn.textContent      = signingUp ? 'Create account' : 'Sign in';
  authSwitch.textContent   = signingUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
  authPassword.autocomplete = signingUp ? 'new-password' : 'current-password';

  authNote.hidden = true;
  say('');
}

function authNoteSay(text, good = false) {
  authNote.textContent = text;
  authNote.className   = 'auth-note' + (good ? ' auth-note-sent' : '');
  authNote.hidden      = !text;
}

async function submitAuth() {
  const email    = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  const signingUp = authMode === 'signup';

  authBtn.disabled  = true;
  authBtn.textContent = signingUp ? 'Creating…' : 'Signing in…';
  authNoteSay('');

  const { data, error } = signingUp
    ? await db.auth.signUp({ email, password })
    : await db.auth.signInWithPassword({ email, password });

  authBtn.disabled = false;
  setAuthMode(authMode);            // puts the button label back

  if (error) { authNoteSay(error.message); return; }

  // If Supabase is set to confirm emails, signUp returns a user but no
  // session — nothing more happens until they click the link.
  if (signingUp && !data.session) {
    authNoteSay(`Account made. Check ${email} to confirm it, then sign in.`, true);
    setAuthMode('signin');
    return;
  }

  // Otherwise onAuthStateChange takes it from here.
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
  authPassword.value = '';
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

taskDialog.addEventListener('close', () => { openTask = { projectId: null, taskId: null }; });
$('taskEditForm').addEventListener('submit', saveTaskDialog);
$('tCancel').addEventListener('click', () => taskDialog.close());

// Enter in the task title saves; the notes box keeps Enter for new lines.
tTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('taskEditForm').requestSubmit(); }
});

$('authForm').addEventListener('submit', e => {
  e.preventDefault();
  submitAuth();
});

authSwitch.addEventListener('click', () => {
  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
});

$('signOutBtn').addEventListener('click', () => db.auth.signOut());

$('importYes').addEventListener('click', runImport);
$('importNo').addEventListener('click',  () => { importBar.hidden = true; });

// Keyboard shortcut: "n" for new project (list view only).
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'n' && !typing && !dialog.open && !taskDialog.open && !e.metaKey && !e.ctrlKey
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
