/* AHX namespace keeps things modular */
const AHX = {
  state: { subjects: [], db: null, user: null, theme: 'light' },
  routes: {},
  util: {}, auth: {}, files: {}, ui: {}, view: {}
};

/* -------------------- boot -------------------- */
(async function boot() {
  // theme from preference/localStorage
  const savedTheme = localStorage.getItem('ahx_theme');
  if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark'); AHX.state.theme = 'dark';
  }

  // initial splash delay just for delight
  setTimeout(() => document.getElementById('splash').style.display = 'none', 900);

  // service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  // load subjects.json
  AHX.state.subjects = await (await fetch('subjects.json')).json();

  // prepare UI controls
  document.getElementById('themeBtn').addEventListener('click', () => AHX.ui.toggleTheme());
  document.getElementById('tabSignIn').addEventListener('click', () => AHX.ui.switchAuthTab('in'));
  document.getElementById('tabSignUp').addEventListener('click', () => AHX.ui.switchAuthTab('up'));

  // auth gate
  AHX.state.user = AHX.auth.current();
  if (AHX.state.user) {
    document.getElementById('userTag').textContent = `Hi, ${AHX.state.user.name}`;
    document.getElementById('app').classList.remove('hidden');
  } else {
    document.getElementById('auth').classList.remove('hidden');
  }

  // IndexedDB open
  AHX.state.db = await AHX.files.openDB();

  // router
  addEventListener('hashchange', AHX.view.render);
  if (!location.hash) location.hash = '#/dashboard';
  AHX.view.render();

  // fill upload subject dropdown
  const sel = document.getElementById('uploadSubject');
  AHX.state.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.key; opt.textContent = `${s.name} (${s.code})`;
    sel.appendChild(opt);
  });
})();

/* -------------------- utils -------------------- */
AHX.util.html = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');

AHX.util.bytes = n => {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
};

/* -------------------- auth (local, replaceable later) -------------------- */
AHX.auth.current = () => {
  const raw = localStorage.getItem('ahx_user');
  return raw ? JSON.parse(raw) : null;
};

AHX.auth.signIn = (e) => {
  e.preventDefault();
  const email = document.getElementById('si_email').value.trim().toLowerCase();
  const pass  = document.getElementById('si_pass').value;
  // demo shortcut
  if (email === 'demo@ahx.app' && pass === '1234') {
    const user = { id: 'demo', name: 'Demo User', email };
    localStorage.setItem('ahx_user', JSON.stringify(user));
    location.reload(); return false;
  }
  const key = `ahx_user_${email}`;
  const rec = localStorage.getItem(key);
  if (!rec) return alert('Account not found. Please sign up.');
  const user = JSON.parse(rec);
  if (user.pass !== pass) return alert('Wrong password.');
  localStorage.setItem('ahx_user', JSON.stringify(user));
  location.reload();
  return false;
};

AHX.auth.signUp = (e) => {
  e.preventDefault();
  const name  = document.getElementById('su_name').value.trim();
  const email = document.getElementById('su_email').value.trim().toLowerCase();
  const pass  = document.getElementById('su_pass').value;
  const key   = `ahx_user_${email}`;
  if (localStorage.getItem(key)) return alert('Account already exists. Sign in.');
  const user = { id: crypto.randomUUID(), name, email, pass };
  localStorage.setItem(key, JSON.stringify(user));
  localStorage.setItem('ahx_user', JSON.stringify(user));
  location.reload();
  return false;
};

AHX.auth.logout = () => {
  localStorage.removeItem('ahx_user');
  location.href = 'index.html';
};

/* -------------------- files (IndexedDB) -------------------- */
AHX.files.openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('ahx_db', 1);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('files')) {
      const store = db.createObjectStore('files', { keyPath: 'id' });
      store.createIndex('by_subject', 'subjectKey', { unique:false });
      store.createIndex('by_name', 'name', { unique:false });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

AHX.files.add = (records) => new Promise((resolve, reject) => {
  const tx = AHX.state.db.transaction('files', 'readwrite');
  const st = tx.objectStore('files');
  records.forEach(r => st.put(r));
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => reject(tx.error);
});

AHX.files.listBySubject = (subjectKey) => new Promise((resolve, reject) => {
  const out = [];
  const tx = AHX.state.db.transaction('files','readonly');
  const ix = tx.objectStore('files').index('by_subject');
  const req = ix.openCursor(IDBKeyRange.only(subjectKey));
  req.onsuccess = (e) => {
    const cur = e.target.result;
    if (cur) { out.push(cur.value); cur.continue(); }
    else resolve(out.sort((a,b)=>b.addedAt-a.addedAt));
  };
  req.onerror = () => reject(req.error);
});

AHX.files.all = () => new Promise((resolve) => {
  const out = [];
  const tx = AHX.state.db.transaction('files','readonly');
  tx.objectStore('files').openCursor().onsuccess = (e) => {
    const cur = e.target.result;
    if (cur) { out.push(cur.value); cur.continue(); }
  };
  tx.oncomplete = () => resolve(out);
});

AHX.files.remove = (id) => new Promise((resolve, reject) => {
  const tx = AHX.state.db.transaction('files','readwrite');
  tx.objectStore('files').delete(id);
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => reject(tx.error);
});

AHX.files.clearAll = () => new Promise((resolve, reject) => {
  const tx = AHX.state.db.transaction('files','readwrite');
  tx.objectStore('files').clear();
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => reject(tx.error);
});

/* upload flow */
AHX.files.saveUploads = async () => {
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
  await AHX.files.add(records);
  AHX.ui.closeUpload();
  // refresh if we are on that subject page
  const { name, param } = AHX.view.getRoute();
  if (name === 'subject' && param === subjectKey) AHX.view.render();
};

/* -------------------- UI helpers -------------------- */
AHX.ui.openUpload = (subjectKey) => {
  const modal = document.getElementById('uploadModal');
  if (subjectKey) document.getElementById('uploadSubject').value = subjectKey;
  modal.classList.remove('hidden');
};
AHX.ui.closeUpload = () => {
  document.getElementById('uploadFiles').value = '';
  document.getElementById('uploadModal').classList.add('hidden');
};

AHX.ui.toggleTheme = () => {
  const root = document.documentElement;
  const next = root.classList.contains('dark') ? 'light' : 'dark';
  root.classList.toggle('dark');
  localStorage.setItem('ahx_theme', next);
};

AHX.ui.switchAuthTab = (which) => {
  const siBtn = document.getElementById('tabSignIn');
  const suBtn = document.getElementById('tabSignUp');
  const siForm= document.getElementById('formSignIn');
  const suForm= document.getElementById('formSignUp');
  if (which === 'up') {
    siBtn.className = 'btn !py-2 rounded-lg';
    suBtn.className = 'btn-primary !py-2 rounded-lg';
    siForm.classList.add('hidden');
    suForm.classList.remove('hidden');
  } else {
    siBtn.className = 'btn-primary !py-2 rounded-lg';
    suBtn.className = 'btn !py-2 rounded-lg';
    suForm.classList.add('hidden');
    siForm.classList.remove('hidden');
  }
};

/* -------------------- Views & Router -------------------- */
AHX.view.getRoute = () => {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts[0] || 'dashboard', param: parts[1] || null };
};

AHX.view.render = async () => {
  const root = document.getElementById('viewRoot');
  const { name, param } = AHX.view.getRoute();

  // gate: if not logged in, show auth portal
  if (!AHX.auth.current()) {
    document.getElementById('auth').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  } else {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('auth').classList.add('hidden');
  }

  if (name === 'dashboard') {
    root.innerHTML = AHX.view.dashboard();
    setTimeout(() => AHX.view.renderSubjectCards(), 30);
    document.getElementById('fab').classList.remove('hidden');
  } else if (name === 'subject' && param) {
    const sub = AHX.state.subjects.find(s => s.key === param);
    if (!sub) { location.hash = '#/dashboard'; return; }
    root.innerHTML = AHX.view.subject(sub);
    AHX.view.renderFileList(sub.key);
    document.getElementById('fab').classList.remove('hidden');
  } else if (name === 'search') {
    root.innerHTML = AHX.view.search();
    document.getElementById('fab').classList.add('hidden');
  } else if (name === 'settings') {
    root.innerHTML = AHX.view.settings();
    document.getElementById('fab').classList.add('hidden');
  } else {
    location.hash = '#/dashboard';
  }
};

/* view templates */
AHX.view.dashboard = () => AHX.util.html`
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold">Dashboard</h2>
    <input id="dashSearch" class="input w-64 max-sm:w-1/2" placeholder="Search subjects..." oninput="AHX.view.filterSubjects(this.value)">
  </div>
  <div id="subGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    ${Array.from({length:6}).map(()=>`<div class="skel h-28"></div>`).join('')}
  </div>
`;

AHX.view.renderSubjectCards = () => {
  const grid = document.getElementById('subGrid');
  grid.innerHTML = '';
  AHX.state.subjects.forEach(s => {
    const el = document.createElement('div');
    el.className = 'card p-4 animate-slide';
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
        <button class="btn" onclick="AHX.ui.openUpload('${s.key}')">Upload</button>
      </div>
    `;
    grid.appendChild(el);
  });
};

AHX.view.filterSubjects = (q) => {
  q = (q||'').toLowerCase();
  const grid = document.getElementById('subGrid');
  Array.from(grid.children).forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
};

AHX.view.subject = (sub) => AHX.util.html`
  <div class="flex items-center justify-between mb-4">
    <div>
      <h2 class="text-xl font-semibold">${sub.name}</h2>
      <span class="badge mt-1">Code: ${sub.code}</span>
    </div>
    <div class="flex gap-2">
      <button class="btn" onclick="history.back()">Back</button>
      <button class="btn-primary" onclick="AHX.ui.openUpload('${sub.key}')">Upload</button>
    </div>
  </div>
  <div id="fileList" class="space-y-2">
    <div class="skel h-10"></div>
    <div class="skel h-10"></div>
  </div>
`;

AHX.view.renderFileList = async (subjectKey) => {
  const list = document.getElementById('fileList');
  const files = await AHX.files.listBySubject(subjectKey);
  if (!files.length) { list.innerHTML = `<div class="text-sm text-gray-500">No files yet. Click “Upload”.</div>`; return; }
  list.innerHTML = files.map(f => {
    const url = URL.createObjectURL(f.blob);
    const added = new Date(f.addedAt).toLocaleString();
    return `
      <div class="card p-3 flex items-center justify-between animate-slide">
        <div>
          <div class="font-medium">${f.name}</div>
          <div class="text-xs text-gray-500">${AHX.util.bytes(f.size)} • ${added}</div>
        </div>
        <div class="flex items-center gap-2">
          <a class="btn" href="${url}" target="_blank" rel="noopener">Open</a>
          <a class="btn" href="${url}" download="${f.name}">Download</a>
          <button class="btn-danger" onclick="AHX.view.deleteFile('${f.id}','${subjectKey}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
};

AHX.view.deleteFile = async (id, subjectKey) => {
  await AHX.files.remove(id);
  AHX.view.renderFileList(subjectKey);
};

AHX.view.search = () => AHX.util.html`
  <div class="mb-3">
    <h2 class="text-xl font-semibold">Search</h2>
    <p class="text-sm text-gray-500">Search stored file names across subjects (local only).</p>
  </div>
  <input id="searchBox" class="input w-full max-w-xl" placeholder="Type to search files..." oninput="AHX.view.searchFiles(this.value)" />
  <div id="searchResults" class="mt-4 space-y-2"></div>
`;

AHX.view.searchFiles = async (q) => {
  q = (q||'').toLowerCase();
  const box = document.getElementById('searchResults');
  box.innerHTML = '';
  if (!q) return;
  const files = await AHX.files.all();
  const hits = files.filter(f => f.name.toLowerCase().includes(q));
  if (!hits.length) { box.innerHTML = `<div class="text-sm text-gray-500">No matches.</div>`; return; }
  box.innerHTML = hits.slice(0,100).map(f => {
    const url = URL.createObjectURL(f.blob);
    return `
      <div class="card p-3 flex items-center justify-between animate-slide">
        <div>
          <div class="font-medium">${f.name}</div>
          <div class="text-xs text-gray-500">Subject: ${f.subjectKey}</div>
        </div>
        <div class="flex gap-2">
          <a class="btn" href="${url}" target="_blank">Open</a>
          <a class="btn-primary" href="#/subject/${f.subjectKey}">Go to subject</a>
        </div>
      </div>
    `;
  }).join('');
};

AHX.view.settings = () => AHX.util.html`
  <h2 class="text-xl font-semibold mb-3">Settings</h2>
  <div class="space-y-3">
    <button class="btn" onclick="AHX.ui.toggleTheme()">Toggle light/dark</button>
    <button class="btn-danger" onclick="AHX.view.clearData()">Clear all local data</button>
    <div class="text-xs text-gray-500">v0.2 — all data is stored locally (IndexedDB). Ready for future API integrations.</div>
  </div>
`;

AHX.view.clearData = () => {
  if (confirm('Clear ALL stored files from this browser?')) {
    AHX.files.clearAll().then(()=>alert('Cleared!'));
  }
};
