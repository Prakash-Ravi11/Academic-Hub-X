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

/* ================= END of app.js ================== */

