/*************** auth (very simple demo) ***************/
function loginUser() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value.trim();
  if (u === 'admin' && p === '1234') {
    localStorage.setItem('ahx_user', u);
    window.location.href = 'app.html#/dashboard';
  } else {
    alert('Invalid credentials (try admin / 1234)');
  }
  return false;
}
function logoutUser() {
  localStorage.removeItem('ahx_user');
  window.location.href = 'index.html';
}

/*************** globals ***************/
let SUBJECTS = [];       // loaded from subjects.json
let DB = null;           // IndexedDB handle
const DB_NAME = 'ahx_db';
const DB_VER  = 1;

/*************** IndexedDB setup ***************/
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // files store: id -> file record
      if (!db.objectStoreNames.contains('files')) {
        const store = db.createObjectStore('files', { keyPath: 'id' });
        store.createIndex('by_subject', 'subjectKey', { unique: false });
        store.createIndex('by_name', 'name', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAddFiles(records) {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction('files', 'readwrite');
    const st = tx.objectStore('files');
    records.forEach(r => st.put(r));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbListFilesBySubject(subjectKey) {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction('files', 'readonly');
    const st = tx.objectStore('files').index('by_subject');
    const out = [];
    const req = st.openCursor(IDBKeyRange.only(subjectKey));
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) { out.push(cur.value); cur.continue(); }
      else resolve(out.sort((a,b)=>b.addedAt-a.addedAt));
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteFile(id) {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClearAll() {
  return new Promise((resolve, reject) => {
    const tx = DB.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/*************** routing ***************/
function getRoute() {
  // routes: #/dashboard | #/search | #/settings | #/subject/<key>
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts[0] || 'dashboard', param: parts[1] || null };
}

function goto(route) {
  location.hash = route;
}

window.addEventListener('hashchange', renderRoute);

/*************** boot (app.html only) ***************/
(async function bootIfApp() {
  if (!document.getElementById('viewRoot')) return;

  // auth gate
  const user = localStorage.getItem('ahx_user');
  if (!user) { window.location.href = 'index.html'; return; }
  document.getElementById('userTag').textContent = `Hi, ${user}`;

  // open DB + load subjects
  DB = await openDB();
  SUBJECTS = await (await fetch('subjects.json')).json();

  // fill subject dropdown in upload modal
  const sel = document.getElementById('uploadSubject');
  SUBJECTS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.key; opt.textContent = `${s.name} (${s.code})`;
    sel.appendChild(opt);
  });

  renderRoute();
})();

/*************** renderers ***************/
async function renderRoute() {
  const { name, param } = getRoute();
  const root = document.getElementById('viewRoot');
  if (!root) return;

  if (name === 'dashboard') {
    root.innerHTML = dashboardView();
    // after paint, load subjects
    const grid = document.getElementById('subGrid');
    setTimeout(() => renderSubjectCards(grid), 50);
    document.getElementById('fab').classList.remove('hidden');
  }
  else if (name === 'subject' && param) {
    const sub = SUBJECTS.find(s => s.key === param);
    if (!sub) { goto('#/dashboard'); return; }
    root.innerHTML = subjectView(sub);
    await renderSubjectFiles(sub.key);
    document.getElementById('fab').classList.remove('hidden');
  }
  else if (name === 'search') {
    root.innerHTML = searchView();
    document.getElementById('fab').classList.add('hidden');
  }
  else if (name === 'settings') {
    root.innerHTML = settingsView();
    document.getElementById('fab').classList.add('hidden');
  }
  else {
    goto('#/dashboard');
  }
}

function dashboardView() {
  return `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">Dashboard</h2>
      <input id="dashSearch" class="input w-64" placeholder="Search subjects..." oninput="filterSubjectCards(this.value)">
    </div>
    <div id="subGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${Array.from({length:6}).map(()=>`<div class="card p-4 skel h-28 rounded-xl"></div>`).join('')}
    </div>
  `;
}

function subjectView(sub) {
  return `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-xl font-semibold">${sub.name}</h2>
        <span class="badge mt-1">Code: ${sub.code}</span>
      </div>
      <div class="flex gap-2">
        <button class="btn" onclick="goto('#/dashboard')">Back</button>
        <button class="btn-primary" onclick="openUploadModal('${sub.key}')">Upload</button>
      </div>
    </div>
    <div id="fileList" class="space-y-2"></div>
  `;
}

function searchView() {
  return `
    <div class="mb-3">
      <h2 class="text-xl font-semibold">Search</h2>
      <p class="text-sm text-gray-500">Search your stored file names across subjects (local only).</p>
    </div>
    <input id="searchBox" class="input w-full max-w-xl" placeholder="Type to search files..." oninput="searchFiles(this.value)" />
    <div id="searchResults" class="mt-4 space-y-2"></div>
  `;
}

function settingsView() {
  return `
    <h2 class="text-xl font-semibold mb-3">Settings</h2>
    <div class="space-y-3">
      <button class="btn" onclick="toggleTheme()">Toggle light/dark (demo)</button>
      <button class="btn-danger" onclick="confirmClear()">Clear all local data</button>
      <p class="text-xs text-gray-500">v0.1 — all data stored locally in your browser via IndexedDB</p>
    </div>
  `;
}

/*************** dashboard subjects ***************/
function renderSubjectCards(container) {
  container.innerHTML = '';
  SUBJECTS.forEach(s => {
    const el = document.createElement('div');
    el.className = 'card p-4';
    el.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="font-semibold">${s.name}</div>
          <div class="text-sm text-gray-500">Code: ${s.code}</div>
        </div>
        <span class="badge">${s.key.replaceAll('_',' ')}</span>
      </div>
      <div class="mt-3 flex gap-2">
        <a class="btn-primary" href="#/subject/${s.key}">Open</a>
        <button class="btn" onclick="openUploadModal('${s.key}')">Upload</button>
      </div>
    `;
    container.appendChild(el);
  });
}

function filterSubjectCards(q) {
  q = (q||'').toLowerCase();
  const grid = document.getElementById('subGrid');
  Array.from(grid.children).forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
}

/*************** subject files ***************/
async function renderSubjectFiles(subjectKey) {
  const list = document.getElementById('fileList');
  list.innerHTML = `<div class="skel h-10 rounded-md"></div>`;
  const files = await dbListFilesBySubject(subjectKey);
  if (files.length === 0) {
    list.innerHTML = `<div class="text-sm text-gray-500">No files yet. Click “Upload”.</div>`;
    return;
  }
  list.innerHTML = files.map(f => fileRowHTML(f)).join('');
}

function fileRowHTML(f) {
  const date = new Date(f.addedAt).toLocaleString();
  return `
    <div class="card p-3 flex items-center justify-between">
      <div>
        <div class="font-medium">${f.name}</div>
        <div class="text-xs text-gray-500">${(f.size/1024).toFixed(1)} KB • ${date}</div>
      </div>
      <div class="flex items-center gap-2">
        <a class="btn" href="${URL.createObjectURL(f.blob)}" target="_blank">Open</a>
        <a class="btn" href="${URL.createObjectURL(f.blob)}" download="${f.name}">Download</a>
        <button class="btn-danger" onclick="deleteFile('${f.id}', '${f.subjectKey}')">Delete</button>
      </div>
    </div>
  `;
}

async function deleteFile(id, subjectKey) {
  await dbDeleteFile(id);
  renderSubjectFiles(subjectKey);
}

/*************** upload modal ***************/
let presetSubject = null;

function openUploadModal(subjectKey) {
  presetSubject = subjectKey || null;
  const modal = document.getElementById('uploadModal');
  const sel = document.getElementById('uploadSubject');
  if (presetSubject) sel.value = presetSubject;
  modal.classList.remove('hidden');
}
function closeUploadModal() {
  document.getElementById('uploadFiles').value = '';
  document.getElementById('uploadModal').classList.add('hidden');
  presetSubject = null;
}

async function saveUploads() {
  const subjectKey = document.getElementById('uploadSubject').value;
  const input = document.getElementById('uploadFiles');
  const files = Array.from(input.files || []);
  if (!files.length) { alert('Choose at least one PDF'); return; }

  const records = await Promise.all(files.map(async (file) => {
    const buf = await file.arrayBuffer();
    return {
      id: crypto.randomUUID(),
      subjectKey,
      name: file.name,
      type: file.type,
      size: file.size,
      addedAt: Date.now(),
      blob: new Blob([buf], { type: file.type })
    };
  }));

  await dbAddFiles(records);
  closeUploadModal();

  const route = getRoute();
  if (route.name === 'subject' && route.param === subjectKey) {
    renderSubjectFiles(subjectKey);
  }
}

/*************** search ***************/
let SEARCH_CACHE = null;

async function ensureSearchCache() {
  if (SEARCH_CACHE) return SEARCH_CACHE;
  // build cache of all files
  const out = [];
  const tx = DB.transaction('files', 'readonly');
  const st = tx.objectStore('files');
  st.openCursor().onsuccess = (e) => {
    const cur = e.target.result;
    if (cur) { out.push(cur.value); cur.continue(); }
  };
  return new Promise(resolve => tx.oncomplete = () => {
    SEARCH_CACHE = out;
    resolve(out);
  });
}

async function searchFiles(q) {
  q = (q||'').toLowerCase();
  const list = document.getElementById('searchResults');
  list.innerHTML = '';
  const files = await ensureSearchCache();
  const hits = files.filter(f => f.name.toLowerCase().includes(q));
  if (!q) return;
  if (hits.length === 0) { list.innerHTML = `<div class="text-sm text-gray-500">No matches.</div>`; return; }
  list.innerHTML = hits.slice(0,100).map(f=>`
    <div class="card p-3 flex items-center justify-between">
      <div>
        <div class="font-medium">${f.name}</div>
        <div class="text-xs text-gray-500">Subject: ${f.subjectKey}</div>
      </div>
      <div class="flex gap-2">
        <a class="btn" href="${URL.createObjectURL(f.blob)}" target="_blank">Open</a>
        <a class="btn" href="${URL.createObjectURL(f.blob)}" download="${f.name}">Download</a>
        <a class="btn-primary" href="#/subject/${f.subjectKey}">Go to subject</a>
      </div>
    </div>
  `).join('');
}

/*************** settings ***************/
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  document.body.classList.toggle('bg-gray-900');
}
function confirmClear() {
  if (confirm('Clear ALL stored files from this browser?')) {
    dbClearAll().then(()=>alert('Cleared!'));
  }
}
