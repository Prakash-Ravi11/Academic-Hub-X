/* app.js - Academic Hub X
   - Supabase v2 auth (CDN) + IndexedDB file storage
   - PWA install prompt handling
   - Router + lightweight view system
   - Comments & hooks for future server sync (Supabase Storage/DB)
*/

/* ================= CONFIG ================== */
/* Replace with your Supabase details from dashboard */
const SUPABASE_URL = 'https://yvlspahwnnzfctqqlmbu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHNwYWh3bm56ZmN0cXFsbWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjQ4NzUsImV4cCI6MjA2OTk0MDg3NX0.5j6phM4WCe7XZo5xHdajwAShkV-hibECc_sp31JI6SQ';

/* constants */
const DEMO_USER_EMAIL = 'demo@ahx.app';
const DEMO_USER_PASS = '1234';

/* ================= GLOBAL NAMESPACE ================== */
window.AHX = {
  state: { subjects: [], db: null, user: null, theme: 'light' },
  util: {}, auth: {}, files: {}, ui: {}, view: {}
};

/* ================= Import supabase (global from CDN) ================== */
// Using supabase JS loaded as UMD: `supabase` global exists, export is createClient
const { createClient } = window.supabase ?? window; // fallback safe-check
const supabase = createClient ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

/* ================= BOOTSTRAP ================== */
(async function boot() {
  // Theme init
  const savedTheme = localStorage.getItem('ahx_theme');
  if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark'); AHX.state.theme = 'dark';
  }

  // Splash timeout (small)
  setTimeout(() => {
    const s = document.getElementById('splash');
    if (s) s.style.display = 'none';
  }, 800);

  // register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      console.log('Service worker registered');
    } catch (err) { console.warn('SW registration failed', err); }
  }

  // load subjects
  try {
    AHX.state.subjects = await (await fetch('subjects.json')).json();
  } catch (err) {
    console.error('Failed to load subjects.json', err);
    AHX.state.subjects = [];
  }

  // wire UI controls that exist before auth
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', AHX.ui.toggleTheme);

  const tabIn = document.getElementById('tabSignIn');
  const tabUp = document.getElementById('tabSignUp');
  if (tabIn) tabIn.addEventListener('click', () => AHX.ui.switchAuthTab('in'));
  if (tabUp) tabUp.addEventListener('click', () => AHX.ui.switchAuthTab('up'));

  if (document.getElementById('installBtn')) {
    document.getElementById('installBtn').addEventListener('click', async () => {
      if (deferredPrompt) {
        const choice = await deferredPrompt.prompt();
        deferredPrompt = null;
        document.getElementById('installBtn').classList.add('hidden');
      }
    });
  }

  // open IndexedDB
  AHX.state.db = await AHX.files.openDB();

  // fill upload subject dropdown (if present)
  const sel = document.getElementById('uploadSubject');
  if (sel) {
    AHX.state.subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.key; opt.textContent = `${s.name} (${s.code})`;
      sel.appendChild(opt);
    });
  }

  // set up route handling
  window.addEventListener('hashchange', AHX.view.render);
  if (!location.hash) location.hash = '#/dashboard';

  // auth state (local quick-check)
  AHX.state.user = AHX.auth.current();
  if (AHX.state.user) {
    document.getElementById('userTag').textContent = `Hi, ${AHX.state.user.name}`;
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) { logoutBtn.classList.remove('hidden'); logoutBtn.addEventListener('click', AHX.auth.logout); }
    document.getElementById('app').classList.remove('hidden');
  } else {
    document.getElementById('auth').classList.remove('hidden');
  }

  // render first view
  AHX.view.render();

})();

/* ================= INSTALL PROMPT HANDLER ================== */
/* Keep deferredPrompt to trigger install from UI */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

/* ================= UTILITIES ================== */
AHX.util.html = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');

AHX.util.bytes = n => {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
};

/* ================= AUTH (Supabase + fallback demo) ================== */
AHX.auth.current = () => {
  const raw = localStorage.getItem('ahx_user');
  return raw ? JSON.parse(raw) : null;
};

AHX.auth.signIn = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const email = (document.getElementById('si_email')?.value || '').trim().toLowerCase();
  const pass = (document.getElementById('si_pass')?.value || '');

  // demo quick login (local)
  if (email === DEMO_USER_EMAIL && pass === DEMO_USER_PASS) {
    const user = { id: 'demo', name: 'Demo User', email };
    localStorage.setItem('ahx_user', JSON.stringify(user));
    location.reload();
    return false;
  }

  if (!supabase) { alert('Supabase not configured. Use demo credentials.'); return false; }

  try {
    // If password is empty -> magic link sign-in; else password sign in
    if (!pass) {
      const { data, error } = await supabase.auth.signInWithOtp({ email });
      if (error) return alert('Magic link send failed: ' + error.message);
      alert('Magic link sent to your email (check spam).');
      return false;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) return alert('Sign in failed: ' + error.message);
      if (data?.user) {
        const short = { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || data.user.email };
        localStorage.setItem('ahx_user', JSON.stringify(short));
        location.reload();
      }
    }
  } catch (err) {
    console.error(err);
    alert('Sign in error');
  }
  return false;
};

AHX.auth.signUp = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const name = (document.getElementById('su_name')?.value || '').trim();
  const email = (document.getElementById('su_email')?.value || '').trim().toLowerCase();
  const pass = (document.getElementById('su_pass')?.value || '');

  if (!supabase) { alert('Supabase not configured. Local demo only.'); return false; }

  try {
    const opts = {};
    if (name) opts.data = { full_name: name };
    const { data, error } = await supabase.auth.signUp({ email, password: pass || undefined, options: opts });
    if (error) return alert('Sign up failed: ' + error.message);
    if (data?.user) {
      const short = { id: data.user.id, name: name || data.user.email, email: data.user.email };
      localStorage.setItem('ahx_user', JSON.stringify(short));
      location.reload();
    } else {
      alert('Sign up initiated. Check your email for confirmation if required.');
    }
  } catch (err) { console.error(err); alert('Sign up error'); }
  return false;
};

AHX.auth.signInWithMagic = async () => {
  const email = (document.getElementById('si_email')?.value || '').trim().toLowerCase();
  if (!email) return alert('Enter email for magic link.');
  if (!supabase) return alert('Supabase not configured.');
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return alert('Magic link failed: ' + error.message);
  alert('Magic link sent to ' + email);
};

AHX.auth.signInWithOAuth = async (provider) => {
  if (!supabase) return alert('Supabase not configured.');
  await supabase.auth.signInWithOAuth({ provider });
};

AHX.auth.logout = async () => {
  // Supabase logout if configured
  if (supabase) {
    try { await supabase.auth.signOut(); } catch(e){ console.warn('supabase signout failed', e); }
  }
  localStorage.removeItem('ahx_user');
  location.href = 'index.html';
};

// handle Supabase auth state changes (e.g., magic link or OAuth redirect)
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const u = session.user;
      const short = { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email };
      localStorage.setItem('ahx_user', JSON.stringify(short));
      // safe re-render if user is currently on auth page
      if (location.hash.startsWith('#/')) AHX.view.render();
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('ahx_user');
    }
  });
}

/* ================= FILES: IndexedDB helpers ================== */
AHX.files.openDB = () => new Promise((resolve, reject) => {
  const r = indexedDB.open('ahx_db', 2);
  r.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('files')) {
      const store = db.createObjectStore('files', { keyPath: 'id' });
      store.createIndex('by_subject', 'subjectKey', { unique: false });
      store.createIndex('by_name', 'name', { unique: false });
    }
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
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

/* Save uploaded files into IndexedDB (blobs) */
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
      type: file.type || 'application/pdf',
      size: file.size,
      addedAt: Date.now(),
      blob: new Blob([buf], { type: file.type || 'application/pdf' })
    };
  }));
  await AHX.files.add(records);
  AHX.ui.closeUpload();
  const { name, param } = AHX.view.getRoute();
  if (name === 'subject' && param === subjectKey) AHX.view.render();
};

/* ================= UI helpers ================== */
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

/* ================= Simple Router & Views ================== */
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

  // show/hide FAB and set content
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

/* templates */
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
    <button class="btn-danger" onclick="if(confirm('Clear ALL stored files?')){AHX.files.clearAll().then(()=>alert('Cleared'));}">Clear all local data</button>
    <div class="text-xs text-gray-500">v1.0 — local IndexedDB file storage. Supabase auth enabled (client-side). For server sync, integrate Supabase Storage (optional).</div>
  </div>
`;
if (!SUPABASE_URL.includes('supabase.co') || typeof SUPABASE_ANON_KEY !== 'string' || SUPABASE_ANON_KEY.length < 20) {
  console.warn('Supabase keys look like placeholders. Replace SUPABASE_URL and SUPABASE_ANON_KEY at the top of app.js with your project values.');
}

/* ---------------------- Supabase client (UMD) ---------------------- */
/* Make sure index.html loads Supabase UMD before this file:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/index.min.js"></script>
*/
if (!window.supabase || !window.supabase.createClient) {
  console.error('Supabase JS not found. Add the UMD script to index.html before app.js');
}
const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------- App namespace & state ---------------------- */
window.AHX = window.AHX || {};
AHX.state = {
  user: null,                   // { id, email, name }
  db: null,                     // IndexedDB instance
  bucket: 'user-files',         // Storage bucket name
  subjects: [],                 // loaded from subjects.json
  pendingSyncInterval: null
};

/* ================= PWA install prompt ================= */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});
AHX.promptInstall = async () => {
  if (!deferredInstallPrompt) return false;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtn')?.classList.add('hidden');
  return choice.outcome === 'accepted';
};

/* ================= Simple toast + Notification helper ================= */
function showToast(msg, opts = { type: 'info', duration: 3500 }) {
  // prefer Notification API if permission granted
  if (window.Notification && Notification.permission === 'granted') {
    try { new Notification('Academic Hub X', { body: msg, icon: 'assets/icon-192.png' }); return; } catch (e) {}
  }
  let cont = document.getElementById('ahx_toast_container');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'ahx_toast_container';
    cont.style.position = 'fixed';
    cont.style.right = '18px';
    cont.style.bottom = '18px';
    cont.style.zIndex = 99999;
    document.body.appendChild(cont);
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.marginTop = '8px';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '10px';
  el.style.boxShadow = '0 8px 30px rgba(2,6,23,0.12)';
  el.style.background = opts.type === 'error' ? '#fee2e2' : opts.type === 'success' ? '#ecfdf5' : '#eef2f7';
  el.style.color = opts.type === 'error' ? '#7f1d1d' : '#0f172a';
  el.style.transition = 'opacity .25s';
  cont.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, opts.duration || 3500);
}
document.addEventListener('click', function _requestNotifOnce() {
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission().then(() => {});
  document.removeEventListener('click', _requestNotifOnce);
});

/* ================= Utilities ================= */
AHX.util = {
  uid: () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 9)),
  bytes: (n) => { if (!n) return '0 B'; if (n < 1024) return `${n} B`; if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; },
  safeJSON: (obj) => { try { return JSON.stringify(obj); } catch(e) { return '{}'; } }
};

/* ================= IndexedDB local mirror ================= */
AHX.localDB = {
  name: 'ahx_local_v1',
  open: () => new Promise((resolve, reject) => {
    if (AHX.state.db) return resolve(AHX.state.db);
    const req = indexedDB.open(AHX.localDB.name, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        const st = db.createObjectStore('files', { keyPath: 'id' });
        st.createIndex('by_user', 'userId', { unique: false });
        st.createIndex('by_subject', 'subject_key', { unique: false });
      }
    };
    req.onsuccess = () => { AHX.state.db = req.result; resolve(req.result); };
    req.onerror = () => { reject(req.error); };
  }),
  addFile: (meta) => new Promise((resolve, reject) => {
    try {
      const tx = AHX.state.db.transaction('files', 'readwrite');
      const st = tx.objectStore('files');
      st.put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target?.error || e);
    } catch (err) { reject(err); }
  }),
  listByUser: (userId) => new Promise((resolve, reject) => {
    const out = [];
    try {
      const tx = AHX.state.db.transaction('files', 'readonly');
      const ix = tx.objectStore('files').index('by_user');
      const req = ix.openCursor(IDBKeyRange.only(userId));
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { out.push(cur.value); cur.continue(); } else { resolve(out.sort((a,b)=> (b.created_at || 0) - (a.created_at || 0))); }
      };
      req.onerror = (e) => reject(e.target?.error || e);
    } catch (err) { reject(err); }
  }),
  remove: (id) => new Promise((resolve, reject) => {
    try {
      const tx = AHX.state.db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target?.error || e);
    } catch (err) { reject(err); }
  }),
  getAllPending: () => new Promise((resolve, reject) => {
    const out = [];
    try {
      const tx = AHX.state.db.transaction('files', 'readonly');
      const req = tx.objectStore('files').openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { if (cur.value.pending) out.push(cur.value); cur.continue(); } else resolve(out);
      };
      req.onerror = (e) => reject(e.target?.error || e);
    } catch (err) { reject(err); }
  }),
  clearAll: () => new Promise((resolve, reject) => {
    try {
      const tx = AHX.state.db.transaction('files','readwrite');
      tx.objectStore('files').clear();
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = (e)=> reject(e.target?.error || e);
    } catch(e){ reject(e); }
  })
};

/* ================= Supabase Auth helpers ================= */
AHX.auth = {};
AHX.auth.setUser = (u) => {
  AHX.state.user = u;
  if (u) {
    localStorage.setItem('ahx_user', JSON.stringify(u));
    document.getElementById('userTag') && (document.getElementById('userTag').textContent = `Hi, ${u.name || u.email}`);
    document.getElementById('logoutBtn')?.classList.remove('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    document.getElementById('auth')?.classList.add('hidden');
  } else {
    localStorage.removeItem('ahx_user');
    document.getElementById('logoutBtn')?.classList.add('hidden');
    document.getElementById('userTag') && (document.getElementById('userTag').textContent = '');
  }
};
AHX.auth.current = () => {
  const raw = localStorage.getItem('ahx_user');
  return raw ? JSON.parse(raw) : null;
};

AHX.auth.signIn = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const email = (document.getElementById('si_email')?.value || '').trim();
  const pass = (document.getElementById('si_pass')?.value || '').trim();
  if (!email) { showToast('Enter email', {type:'error'}); return false; }
  if (!supabase) { showToast('Supabase not configured', {type:'error'}); return false; }
  try {
    if (!pass) {
      // send magic link
      await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      showToast('Magic link sent — check inbox');
      return false;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      const u = data.user;
      const short = { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.full_name) || u.email };
      AHX.auth.setUser(short);
      showToast('Signed in', {type:'success'});
      // render dashboard after login
      setTimeout(()=> { if (AHX.view && AHX.view.render) AHX.view.render(); }, 200);
      return false;
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Sign in failed', {type:'error'});
    return false;
  }
};

AHX.auth.signUp = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const name = (document.getElementById('su_name')?.value || '').trim();
  const email = (document.getElementById('su_email')?.value || '').trim();
  const pass = (document.getElementById('su_pass')?.value || '').trim();
  if (!email) { showToast('Enter email', {type:'error'}); return false; }
  if (!supabase) { showToast('Supabase not configured', {type:'error'}); return false; }
  try {
    const opts = {};
    if (name) opts.data = { full_name: name };
    const { data, error } = await supabase.auth.signUp({ email, password: pass || undefined, options: opts });
    if (error) throw error;
    if (data && data.user) {
      const short = { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || data.user.email };
      AHX.auth.setUser(short);
      showToast('Account created', {type:'success'});
      setTimeout(()=> { if (AHX.view && AHX.view.render) AHX.view.render(); }, 200);
    } else {
      showToast('Sign up initiated — check email to confirm', {type:'info'});
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Sign up failed', {type:'error'});
  }
  return false;
};

AHX.auth.signInWithMagicPrompt = async () => {
  const email = (document.getElementById('si_email')?.value || '').trim();
  if (!email) return showToast('Enter email', {type:'error'});
  try {
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    showToast('Magic link sent');
  } catch (e) {
    console.error(e);
    showToast('Magic link failed', {type:'error'});
  }
};

AHX.auth.signInWithOAuth = async (provider) => {
  if (!provider) return;
  try {
    await supabase.auth.signInWithOAuth({ provider });
  } catch (e) {
    console.error(e);
    showToast('OAuth failed', {type:'error'});
  }
};

AHX.auth.signOut = async () => {
  try { if (supabase) await supabase.auth.signOut(); } catch(e){ console.warn(e); }
  AHX.auth.setUser(null);
  showToast('Signed out', {type:'info'});
  setTimeout(()=>location.reload(), 200);
};

// Supabase auth state listener (magic links / external sign-ins)
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      const u = session.user;
      const short = { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email };
      AHX.auth.setUser(short);
      // attempt to retry pending sync for this user
      setTimeout(() => AHX.storage.retryPending(), 1500);
    }
  });
}

/* ================= Storage upload + metadata insert ================= */
AHX.storage = {};

// Upload a single File object, create metadata, mirror locally.
// Returns metadata object or throws.
AHX.storage.upload = async (file, subject_key) => {
  if (!AHX.state.user) throw new Error('Not signed in');
  if (!supabase) throw new Error('Supabase not configured');
  const userId = AHX.state.user.id;
  const id = AHX.util.uid();
  const safeName = file.name.replace(/\s+/g,'_');
  const path = `${userId}/${id}_${safeName}`;

  showToast(`Uploading ${file.name}...`);

  // upload binary to storage
  const { data: uploadData, error: uploadErr } = await supabase.storage.from(AHX.state.bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (uploadErr) {
    console.error('upload error', uploadErr);
    showToast('Upload failed', {type:'error'});
    throw uploadErr;
  }

  // create signed url for preview (7 days)
  let public_url = null;
  try {
    const { data: urlData, error: urlErr } = await supabase.storage.from(AHX.state.bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!urlErr && urlData) public_url = urlData.signedUrl;
  } catch (e) { console.warn('signed url err', e); }

  // metadata record - match your DB columns in file_metadata
  const meta = {
    id,
    user_id: userId,
    subject_key: subject_key || null,
    file_name: file.name,
    file_path: path,
    file_size: file.size,
    content_type: file.type || 'application/octet-stream',
    public_url,
    created_at: new Date().toISOString()
  };

  // insert into Postgres table 'file_metadata'
  try {
    const { data: inserted, error: insertErr } = await supabase.from('file_metadata').insert([meta]).select().single();
    if (insertErr) throw insertErr;
    // save in local IndexedDB mirror
    await AHX.localDB.addFile({ ...meta, addedAt: Date.now(), pending: false, userId });
    showToast('Upload complete', {type:'success'});
    return inserted || meta;
  } catch (err) {
    console.warn('metadata insert failed', err);
    // Save local pending record
    await AHX.localDB.addFile({ ...meta, addedAt: Date.now(), pending: true, userId });
    showToast('Uploaded but metadata pending (offline). Will retry.', {type:'error'});
    return meta;
  }
};

// Download (open) file using signed URL; generate new signed URL when needed
AHX.storage.open = async (meta) => {
  if (meta.public_url) { window.open(meta.public_url, '_blank'); return; }
  if (!supabase) { showToast('Supabase not configured', {type:'error'}); return; }
  const { data, error } = await supabase.storage.from(AHX.state.bucket).createSignedUrl(meta.file_path, 60 * 60);
  if (error) { console.error('signed url error', error); showToast('Failed to get file URL', {type:'error'}); return; }
  window.open(data.signedUrl, '_blank');
};

// Delete file: remove object from storage and metadata from DB and local mirror
AHX.storage.delete = async (meta) => {
  if (!confirm(`Delete "${meta.file_name}"? This cannot be undone.`)) return false;
  try {
    // delete from storage
    const { error: delErr } = await supabase.storage.from(AHX.state.bucket).remove([meta.file_path]);
    if (delErr) {
      console.warn('storage delete error', delErr);
      showToast('Failed to delete file from storage', {type:'error'});
      // continue to attempt metadata delete
    }
    // delete metadata from table
    const { error: dbErr } = await supabase.from('file_metadata').delete().eq('id', meta.id);
    if (dbErr) {
      console.warn('db delete error', dbErr);
      showToast('Failed to delete metadata', {type:'error'});
      return false;
    }
    // remove local
    await AHX.localDB.remove(meta.id);
    showToast('Deleted', {type:'success'});
    if (typeof AHX.view?.render === 'function') AHX.view.render();
    return true;
  } catch (e) {
    console.error(e);
    showToast('Delete failed', {type:'error'});
    return false;
  }
};

/* Retry pending local metadata */
AHX.storage.retryPending = async () => {
  if (!AHX.state.db || !AHX.state.user) return;
  try {
    const pending = await AHX.localDB.getAllPending();
    for (const rec of pending) {
      try {
        // try to insert into file_metadata
        const { data, error } = await supabase.from('file_metadata').insert([rec]).select().single();
        if (!error) {
          // mark local as synced
          rec.pending = false;
          await AHX.localDB.addFile(rec);
          showToast(`Synced ${rec.file_name}`, {type:'success'});
        }
      } catch (e) {
        console.warn('retry item failed', e);
      }
    }
  } catch (e) {
    console.warn('retryPending failed', e);
  }
};

/* ================= UI wiring + Upload flow helpers (used by index.html) ================= */
AHX.files = {
  // called by Upload modal Save button (index.html uses AHX.files.saveUploads())
  saveUploads: async () => {
    const input = document.getElementById('uploadFiles');
    const subjectKey = document.getElementById('uploadSubject')?.value || null;
    if (!input || !input.files || input.files.length === 0) { showToast('Choose at least one PDF', {type:'error'}); return; }
    const files = Array.from(input.files);
    for (const f of files) {
      try {
        await AHX.storage.upload(f, subjectKey);
      } catch (err) {
        console.error('upload err', err);
      }
    }
    // close modal and refresh list
    AHX.ui.closeUpload();
    if (AHX.view && AHX.view.render) AHX.view.render();
  }
};

/* ================= UI helpers (open/close upload modal) ================= */
AHX.ui = {
  openUpload: (subjectKey) => {
    if (subjectKey) document.getElementById('uploadSubject') && (document.getElementById('uploadSubject').value = subjectKey);
    document.getElementById('uploadModal')?.classList.remove('hidden');
  },
  closeUpload: () => {
    const input = document.getElementById('uploadFiles');
    if (input) input.value = '';
    document.getElementById('uploadModal')?.classList.add('hidden');
  },
  switchAuthTab: (which) => {
    const si = document.getElementById('formSignIn');
    const su = document.getElementById('formSignUp');
    const bsi = document.getElementById('tabSignIn');
    const bsu = document.getElementById('tabSignUp');
    if (which === 'up') { si.classList.add('hidden'); su.classList.remove('hidden'); bsi.className = 'btn'; bsu.className = 'btn-primary'; }
    else { su.classList.add('hidden'); si.classList.remove('hidden'); bsi.className = 'btn-primary'; bsu.className = 'btn'; }
  }
};

/* ================= Basic SPA view logic (dashboard, subject pages, search) ================= */
AHX.view = {};
AHX.view.getRoute = () => {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts[0] || 'dashboard', param: parts[1] || null };
};

AHX.view.render = async () => {
  const root = document.getElementById('viewRoot');
  const route = AHX.view.getRoute();

  // Auth gate
  if (!AHX.auth.current()) {
    document.getElementById('auth')?.classList.remove('hidden');
    document.getElementById('app')?.classList.add('hidden');
    return;
  } else {
    document.getElementById('app')?.classList.remove('hidden');
    document.getElementById('auth')?.classList.add('hidden');
  }

  if (route.name === 'dashboard') {
    root.innerHTML = AHX.view.dashboard();
    setTimeout(() => AHX.view.renderSubjectCards(), 50);
    document.getElementById('fab')?.classList.remove('hidden');
  } else if (route.name === 'subject' && route.param) {
    const sub = AHX.state.subjects.find(s => s.key === route.param);
    if (!sub) { location.hash = '#/dashboard'; return; }
    root.innerHTML = AHX.view.subject(sub);
    AHX.view.renderFileList(sub.key);
    document.getElementById('fab')?.classList.remove('hidden');
  } else if (route.name === 'search') {
    root.innerHTML = AHX.view.search();
    document.getElementById('fab')?.classList.add('hidden');
  } else if (route.name === 'settings') {
    root.innerHTML = AHX.view.settings();
    document.getElementById('fab')?.classList.add('hidden');
  } else {
    location.hash = '#/dashboard';
  }
};

/* Templates and renderers */
AHX.view.dashboard = () => `
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold">Dashboard</h2>
    <input id="dashSearch" class="input w-64" placeholder="Search subjects..." oninput="AHX.view.filterSubjects(this.value)">
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
  q = (q || '').toLowerCase();
  const grid = document.getElementById('subGrid');
  Array.from(grid.children).forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
};

AHX.view.subject = (sub) => `
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
  if (!AHX.state.user) { list.innerHTML = `<div class="text-sm text-gray-500">Please sign in to view files.</div>`; return; }
  const local = await AHX.localDB.listByUser(AHX.state.user.id).catch(()=>[]);
  const files = local.filter(f => (f.subject_key || f.subjectKey) === subjectKey);
  if (!files.length) { list.innerHTML = `<div class="text-sm text-gray-500">No files yet. Click “Upload”.</div>`; return; }
  list.innerHTML = files.map(f => {
    const added = new Date(f.addedAt || f.created_at || Date.now()).toLocaleString();
    return `
      <div class="card p-3 flex items-center justify-between animate-slide">
        <div>
          <div class="font-medium">${f.file_name || f.name}</div>
          <div class="text-xs text-gray-500">${AHX.util.bytes(f.file_size || f.size)} • ${added}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn" onclick='AHX.storage.open(${AHX.util.safeJSON(f)})'>Open</button>
          <button class="btn" onclick='AHX.storage.delete(${AHX.util.safeJSON(f)})'>Delete</button>
        </div>
      </div>
    `;
  }).join('');
};

AHX.view.search = () => `
  <div class="mb-3">
    <h2 class="text-xl font-semibold">Search</h2>
    <p class="text-sm text-gray-500">Search stored file names across subjects (local only).</p>
  </div>
  <input id="searchBox" class="input w-full max-w-xl" placeholder="Type to search files..." oninput="AHX.view.searchFiles(this.value)" />
  <div id="searchResults" class="mt-4 space-y-2"></div>
`;

AHX.view.searchFiles = async (q) => {
  q = (q || '').toLowerCase();
  const box = document.getElementById('searchResults'); box.innerHTML = '';
  if (!q) return;
  const files = await AHX.localDB.listByUser(AHX.state.user.id).catch(()=>[]);
  const hits = files.filter(f => (f.file_name || f.name).toLowerCase().includes(q));
  if (!hits.length) { box.innerHTML = `<div class="text-sm text-gray-500">No matches.</div>`; return; }
  box.innerHTML = hits.slice(0,100).map(f => `
    <div class="card p-3 flex items-center justify-between animate-slide">
      <div>
        <div class="font-medium">${f.file_name || f.name}</div>
        <div class="text-xs text-gray-500">Subject: ${f.subject_key || f.subjectKey || 'N/A'}</div>
      </div>
      <div class="flex gap-2">
        <button class="btn" onclick='AHX.storage.open(${AHX.util.safeJSON(f)})'>Open</button>
        <a class="btn-primary" href="#/subject/${f.subject_key || f.subjectKey}">Go to subject</a>
      </div>
    </div>
  `).join('');
};

AHX.view.settings = () => `
  <h2 class="text-xl font-semibold mb-3">Settings</h2>
  <div class="space-y-3">
    <button class="btn" onclick="document.documentElement.classList.toggle('dark')">Toggle light/dark</button>
    <button class="btn-danger" onclick="if(confirm('Clear ALL stored files from local DB?')){AHX.localDB.clearAll().then(()=>{alert('Cleared local DB'); if (AHX.view && AHX.view.render) AHX.view.render();})}">Clear local DB</button>
    <div class="text-xs text-gray-500">v1.0 — local IndexedDB mirror & Supabase storage/auth</div>
  </div>
`;

/* ================= Boot: initialize UI, DB, SW, and event wiring ================= */
(async function boot() {
  // load subjects
  try { AHX.state.subjects = await (await fetch('subjects.json')).json(); } catch (e) { AHX.state.subjects = []; console.warn('subjects.json load failed', e); }

  // open local DB
  try { await AHX.localDB.open(); } catch (e) { console.error('IndexedDB open failed', e); }

  // restore user if present
  const stored = AHX.auth.current();
  if (stored) AHX.auth.setUser(stored);

  // wire auth tab buttons
  document.getElementById('tabSignIn')?.addEventListener('click', ()=>AHX.ui.switchAuthTab('in'));
  document.getElementById('tabSignUp')?.addEventListener('click', ()=>AHX.ui.switchAuthTab('up'));

  // wire sign-in form
  document.getElementById('formSignIn')?.addEventListener('submit', AHX.auth.signIn);
  document.getElementById('formSignUp')?.addEventListener('submit', AHX.auth.signUpSubmit || AHX.auth.signUp);

  // wire Upload Save button (function provided in index.html calls AHX.files.saveUploads())
  // wire fab to open upload modal
  const fab = document.getElementById('fab');
  if (fab) {
    fab.classList.remove('hidden');
    fab.addEventListener('click', () => AHX.ui.openUpload());
  }

  // fill subject dropdown in upload modal
  const sel = document.getElementById('uploadSubject');
  if (sel && AHX.state.subjects.length) {
    sel.innerHTML = '';
    AHX.state.subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.key; opt.textContent = `${s.name} (${s.code})`;
      sel.appendChild(opt);
    });
  }

  // wire logout
  document.getElementById('logoutBtn')?.addEventListener('click', AHX.auth.signOut);

  // register service worker
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); console.log('Service worker registered'); } catch (e) { console.warn('SW registration failed', e); }
  }

  // initial route
  if (!location.hash) location.hash = '#/dashboard';
  window.addEventListener('hashchange', AHX.view.render);
  // initial render
  if (AHX.auth.current()) {
    if (AHX.view && AHX.view.render) AHX.view.render();
  } else {
    document.getElementById('auth')?.classList.remove('hidden');
  }

  // periodic pending retry (every 30s while signed in)
  if (AHX.state.pendingSyncInterval) clearInterval(AHX.state.pendingSyncInterval);
  AHX.state.pendingSyncInterval = setInterval(()=>{ if (AHX.state.user) AHX.storage.retryPending(); }, 30000);

  // notification permission prompt is requested on first user click (see above)
})();

/* ================= Expose small API for console debugging ================= */
window.AHX = window.AHX || {};
window.AHX.storage = AHX.storage;
window.AHX.auth = AHX.auth;
window.AHX.localDB = AHX.localDB;
window.AHX.view = AHX.view;
window.AHX.util = AHX.util;
window.AHX.showToast = showToast;


/* ================= END of app.js ================== */


