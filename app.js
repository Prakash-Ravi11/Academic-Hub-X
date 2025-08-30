/* app.js - Academic Hub X (robust rewrite) */

// Config
const SUPABASE_URL = 'https://yvlspahwnnzfctqqlmbu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHNwYWh3bm56ZmN0cXFsbWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjQ4NzUsImV4cCI6MjA2OTk0MDg3NX0.5j6phM4WCe7XZo5xHdajwAShkV-hibECc_sp31JI6SQ';
const DEMO_USER_EMAIL = 'demo@ahx.app';
const DEMO_USER_PASS = '1234';

// Global namespace
window.AHX = {
  state: { subjects: [], db: null, user: null, theme: 'light' },
  util: {},
  auth: {},
  files: {},
  ui: {},
  view: {}
};

// Supabase init
const { createClient } = window.supabase ?? window;
const supabase = createClient ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// PWA install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

// Utilities pipeline
AHX.util.html = (strings, ...vals) => strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
AHX.util.bytes = n => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

// Force splash hide to prevent stuck loading
(function safeSplashHide() {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
  }, 1500); // Increased timeout for robustness
})();

// Bootstrap with error handling
(async function boot() {
  try {
    // Theme init
    const savedTheme = localStorage.getItem('ahx_theme');
    if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      AHX.state.theme = 'dark';
    }

    // Service worker
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('sw.js');
      console.log('Service worker registered');
    }

    // Load subjects with fallback
    const resp = await fetch('subjects.json');
    AHX.state.subjects = resp.ok ? await resp.json() : [];

    // Wire UI controls
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', AHX.ui.toggleTheme);

    const tabIn = document.getElementById('tabSignIn');
    const tabUp = document.getElementById('tabSignUp');
    if (tabIn) tabIn.addEventListener('click', () => AHX.ui.switchAuthTab('in'));
    if (tabUp) tabUp.addEventListener('click', () => AHX.ui.switchAuthTab('up'));

    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
          installBtn.classList.add('hidden');
        }
      });
    }
    // QR Scanner functionality
AHX.files.addScannedFile = async (fileInfo) => {
  try {
    const record = {
      id: crypto.randomUUID(),
      name: fileInfo.name || 'Scanned File',
      type: fileInfo.type || 'scanned',
      url: fileInfo.url,
      scannedAt: Date.now(),
      subjectKey: 'scanned', // Default subject for scanned files
      size: 0, // Unknown size for URLs
      content: fileInfo.content || null
    };
    
    await AHX.files.add([record]);
    return record;
  } catch (error) {
    console.error('Failed to save scanned file:', error);
    throw error;
  }
};

// Update subjects to include scanned files
AHX.state.subjects.push({
  key: 'scanned',
  name: 'Scanned Notes',
  code: 'SCAN',
  description: 'Files scanned via QR code'
});


    // Open IndexedDB with fallback
    AHX.state.db = await AHX.files.openDB();

    // Fill upload dropdown
    const sel = document.getElementById('uploadSubject');
    if (sel) {
      AHX.state.subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key;
        opt.textContent = `${s.name} (${s.code})`;
        sel.appendChild(opt);
      });
    }

    // Route handling
    window.addEventListener('hashchange', AHX.view.render);
    if (!location.hash) location.hash = '#/dashboard';

    // Auth state
    AHX.state.user = AHX.auth.current();
    if (AHX.state.user) {
      document.getElementById('userTag').textContent = `Hi, ${AHX.state.user.name}`;
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        logoutBtn.addEventListener('click', AHX.auth.logout);
      }
      document.getElementById('app').classList.remove('hidden');
    } else {
      document.getElementById('auth').classList.remove('hidden');
    }

    // Initial render
    await AHX.view.render();
  } catch (err) {
    console.error('Bootstrap error:', err);
    alert('App initialization failed. Some features may be unavailable.');
  } finally {
    // Always hide splash
    const splash = document.getElementById('splash');
    if (splash) splash.style.display = 'none';
  }
})();

// Auth pipeline
AHX.auth.current = () => {
  try {
    const raw = localStorage.getItem('ahx_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

AHX.auth.signIn = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const email = (document.getElementById('si_email')?.value || '').trim().toLowerCase();
  const pass = (document.getElementById('si_pass')?.value || '');
  try {
    if (email === DEMO_USER_EMAIL && pass === DEMO_USER_PASS) {
      const user = { id: 'demo', name: 'Demo User', email };
      localStorage.setItem('ahx_user', JSON.stringify(user));
      location.reload();
      return false;
    }
    if (!supabase) throw new Error('Supabase not configured');
    let data, error;
    if (!pass) {
      ({ data, error } = await supabase.auth.signInWithOtp({ email }));
      if (error) throw error;
      alert('Magic link sent to your email (check spam).');
    } else {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password: pass }));
      if (error) throw error;
      if (data?.user) {
        const short = { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || data.user.email };
        localStorage.setItem('ahx_user', JSON.stringify(short));
        location.reload();
      }
    }
  } catch (err) {
    console.error('Sign in error:', err);
    alert('Sign in failed: ' + (err.message || 'Unknown error'));
  }
  return false;
};

AHX.auth.signUp = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const name = (document.getElementById('su_name')?.value || '').trim();
  const email = (document.getElementById('su_email')?.value || '').trim().toLowerCase();
  const pass = (document.getElementById('su_pass')?.value || '');
  try {
    if (!supabase) throw new Error('Supabase not configured');
    const opts = name ? { data: { full_name: name } } : {};
    const { data, error } = await supabase.auth.signUp({ email, password: pass || undefined, options: opts });
    if (error) throw error;
    if (data?.user) {
      const short = { id: data.user.id, name: name || data.user.email, email: data.user.email };
      localStorage.setItem('ahx_user', JSON.stringify(short));
      location.reload();
    } else {
      alert('Sign up initiated. Check your email for confirmation if required.');
    }
  } catch (err) {
    console.error('Sign up error:', err);
    alert('Sign up failed: ' + (err.message || 'Unknown error'));
  }
  return false;
};

AHX.auth.signInWithMagic = async () => {
  const email = (document.getElementById('si_email')?.value || '').trim().toLowerCase();
  try {
    if (!email) throw new Error('Enter email for magic link');
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    alert('Magic link sent to ' + email);
  } catch (err) {
    console.error('Magic link error:', err);
    alert('Magic link failed: ' + (err.message || 'Unknown error'));
  }
};

AHX.auth.signInWithOAuth = async (provider) => {
  try {
    if (!supabase) throw new Error('Supabase not configured');
    await supabase.auth.signInWithOAuth({ provider });
  } catch (err) {
    console.error('OAuth error:', err);
    alert('OAuth sign in failed');
  }
};

AHX.auth.logout = async () => {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch (err) {
    console.warn('Logout error:', err);
  } finally {
    localStorage.removeItem('ahx_user');
    location.href = 'index.html';
  }
};

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const u = session.user;
      const short = { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email };
      localStorage.setItem('ahx_user', JSON.stringify(short));
      if (location.hash.startsWith('#/')) AHX.view.render();
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('ahx_user');
    }
  });
}

// Files/DB pipeline
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

AHX.files.add = async (records) => {
  try {
    const tx = AHX.state.db.transaction('files', 'readwrite');
    const st = tx.objectStore('files');
    records.forEach(r => st.put(r));
    await new Promise(resolve => tx.oncomplete = resolve);
    return true;
  } catch (err) {
    console.error('DB add error:', err);
    throw err;
  }
};

AHX.files.listBySubject = async (subjectKey) => {
  try {
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = AHX.state.db.transaction('files', 'readonly');
      const ix = tx.objectStore('files').index('by_subject');
      const req = ix.openCursor(IDBKeyRange.only(subjectKey));
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        } else {
          resolve(out.sort((a, b) => b.addedAt - a.addedAt));
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('List by subject error:', err);
    return [];
  }
};

AHX.files.all = async () => {
  try {
    return new Promise((resolve) => {
      const out = [];
      const tx = AHX.state.db.transaction('files', 'readonly');
      const req = tx.objectStore('files').openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        }
      };
      tx.oncomplete = () => resolve(out);
    });
  } catch (err) {
    console.error('DB all error:', err);
    return [];
  }
};

AHX.files.remove = async (id) => {
  try {
    const tx = AHX.state.db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    await new Promise(resolve => tx.oncomplete = resolve);
    return true;
  } catch (err) {
    console.error('DB remove error:', err);
    throw err;
  }
};

AHX.files.clearAll = async () => {
  try {
    const tx = AHX.state.db.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
    await new Promise(resolve => tx.oncomplete = resolve);
    return true;
  } catch (err) {
    console.error('DB clear error:', err);
    throw err;
  }
};

AHX.files.saveUploads = async () => {
  try {
    const subjectKey = document.getElementById('uploadSubject')?.value;
    const input = document.getElementById('uploadFiles');
    const files = Array.from(input?.files || []);
    if (!files.length) {
      alert('Choose at least one PDF');
      return;
    }
    if (!subjectKey) {
      alert('Select a subject');
      return;
    }
    const records = await Promise.all(files.map(async file => {
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
    if (name === 'subject' && param === subjectKey) await AHX.view.render();
  } catch (err) {
    console.error('Save uploads error:', err);
    alert('Failed to save files. Try again.');
  }
};

// UI pipeline
AHX.ui.openUpload = (subjectKey) => {
  const modal = document.getElementById('uploadModal');
  if (modal) {
    if (subjectKey) document.getElementById('uploadSubject').value = subjectKey;
    modal.classList.remove('hidden');
  }
};

AHX.ui.closeUpload = () => {
  const input = document.getElementById('uploadFiles');
  if (input) input.value = '';
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('hidden');
};

AHX.ui.toggleTheme = () => {
  const root = document.documentElement;
  root.classList.toggle('dark');
  const next = root.classList.contains('dark') ? 'dark' : 'light';
  localStorage.setItem('ahx_theme', next);
};

AHX.ui.switchAuthTab = (which) => {
  const siBtn = document.getElementById('tabSignIn');
  const suBtn = document.getElementById('tabSignUp');
  const siForm = document.getElementById('formSignIn');
  const suForm = document.getElementById('formSignUp');
  if (siBtn && suBtn && siForm && suForm) {
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
  }
};

// Views/router pipeline
AHX.view.getRoute = () => {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts || 'dashboard', param: parts[1] || null };
};

AHX.view.render = async () => {
  try {
    const root = document.getElementById('viewRoot');
    if (!root) return;
    const { name, param } = AHX.view.getRoute();

    // Auth gate
    if (!AHX.auth.current()) {
      document.getElementById('auth')?.classList.remove('hidden');
      document.getElementById('app')?.classList.add('hidden');
      return;
    } else {
      document.getElementById('app')?.classList.remove('hidden');
      document.getElementById('auth')?.classList.add('hidden');
    }

    const fab = document.getElementById('fab');
    if (name === 'dashboard') {
      root.innerHTML = AHX.view.dashboard();
      setTimeout(AHX.view.renderSubjectCards, 30);
      fab?.classList.remove('hidden');
    } else if (name === 'subject' && param) {
      const sub = AHX.state.subjects.find(s => s.key === param);
      if (!sub) {
        location.hash = '#/dashboard';
        return;
      }
      root.innerHTML = AHX.view.subject(sub);
      await AHX.view.renderFileList(sub.key);
      fab?.classList.remove('hidden');
    } else if (name === 'search') {
      root.innerHTML = AHX.view.search();
      fab?.classList.add('hidden');
    } else if (name === 'settings') {
      root.innerHTML = AHX.view.settings();
      fab?.classList.add('hidden');
    } else {
      location.hash = '#/dashboard';
    }
  } catch (err) {
    console.error('Render error:', err);
    alert('View failed to load. Returning to dashboard.');
    location.hash = '#/dashboard';
  }
};

// Templates (kept original, with fallbacks)
AHX.view.dashboard = () => AHX.util.html`
  <h2>Dashboard</h2>
  <div id="subjectCards"></div>
`;

AHX.view.renderSubjectCards = async () => {
  const container = document.getElementById('subjectCards');
  if (!container) return;
  container.innerHTML = ''; // Clear
  try {
    const files = await AHX.files.all();
    AHX.state.subjects.forEach(sub => {
      const count = files.filter(f => f.subjectKey === sub.key).length;
      const card = AHX.util.html`
        <div class="card" style="padding:16px; margin-bottom:16px;">
          <h3>${sub.name} (${sub.code})</h3>
          <p>${count} files</p>
          <a href="#/subject/${sub.key}">View</a>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', card);
    });
  } catch {
    container.innerHTML = '<p>Failed to load subjects.</p>';
  }
};

AHX.view.subject = (sub) => AHX.util.html`
  <h2>${sub.name} (${sub.code})</h2>
  <div id="fileList"></div>
  <button onclick="AHX.ui.openUpload('${sub.key}')">Upload to this subject</button>
`;

AHX.view.renderFileList = async (subjectKey) => {
  const container = document.getElementById('fileList');
  if (!container) return;
  container.innerHTML = ''; // Clear
  try {
    const files = await AHX.files.listBySubject(subjectKey);
    if (!files.length) {
      container.innerHTML = '<p>No files yet.</p>';
      return;
    }
    files.forEach(file => {
      const item = AHX.util.html`
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #e5e7eb;">
          <span>${file.name} (${AHX.util.bytes(file.size)})</span>
          <button onclick="AHX.files.remove('${file.id}').then(() => AHX.view.render())">Delete</button>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', item);
    });
  } catch {
    container.innerHTML = '<p>Failed to load files.</p>';
  }
};

AHX.view.search = () => AHX.util.html`
  <h2>Search</h2>
  <input type="text" placeholder="Search stored file names across subjects (local only)" class="input">
  <!-- Implement search logic here if needed -->
`;

AHX.view.settings = () => AHX.util.html`
  <h2>Settings</h2>
  <button onclick="AHX.files.clearAll().then(() => alert('All files cleared'))">Clear all local files</button>
`;

