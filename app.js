/* app.js - Academic Hub X (robust rewrite) */

// Config
const SUPABASE_URL = 'https://yvlspahwnnzfctqqlmbu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHNwYWh3bm56ZmN0cXFsbWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjQ4NzUsImV4cCI6MjA2OTk0MDg3NX0.5j6phM4WCe7XZo5xHdajwAShkV-hibECc_sp31JI6SQ';
// Enhanced authentication with better error handling
async function handleSignIn(event) {
  event.preventDefault();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;
  
  setLoading('signin', true);
  clearMessages();
  
  try {
    // Check internet connectivity first
    if (!navigator.onLine) {
      throw new Error('No internet connection. Please check your network and try again.');
    }
    
    // Validate Supabase configuration
    if (!supabase) {
      throw new Error('Authentication service not configured properly.');
    }
    
    // Validate inputs
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }
    
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    // Attempt sign in with timeout
    const signInPromise = supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
    );
    
    const { data, error } = await Promise.race([signInPromise, timeoutPromise]);
    
    if (error) {
      // Handle specific Supabase errors
      switch (error.message) {
        case 'Invalid login credentials':
          throw new Error('Incorrect email or password. Please try again.');
        case 'Email not confirmed':
          throw new Error('Please check your email and confirm your account first.');
        case 'Too many requests':
          throw new Error('Too many login attempts. Please wait a few minutes.');
        default:
          throw new Error(error.message || 'Failed to sign in. Please try again.');
      }
    }
    
    if (data?.user) {
      // Store user data safely
      const userData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
        avatar: data.user.user_metadata?.avatar_url || null
      };
      
      try {
        localStorage.setItem('ahx_user', JSON.stringify(userData));
        localStorage.setItem('ahx_session', JSON.stringify(data.session));
      } catch (storageError) {
        console.warn('Failed to store user data locally:', storageError);
      }
      
      showSuccess('Welcome back! Redirecting to dashboard...');
      
      // Redirect after success message
      setTimeout(() => {
        window.location.href = 'app.html';
      }, 1500);
    } else {
      throw new Error('Authentication failed. Please try again.');
    }
    
  } catch (error) {
    console.error('Sign in error:', error);
    
    // Show user-friendly error messages
    if (error.message.includes('fetch')) {
      showError('Network error. Please check your internet connection and try again.');
    } else if (error.message.includes('JSON')) {
      showError('Service temporarily unavailable. Please try again in a few moments.');
    } else {
      showError(error.message || 'Sign in failed. Please try again.');
    }
  } finally {
    setLoading('signin', false);
  }
}

// Email validation helper
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Enhanced sign up function
async function handleSignUp(event) {
  event.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  
  setLoading('signup', true);
  clearMessages();
  
  try {
    // Validation checks
    if (!navigator.onLine) {
      throw new Error('No internet connection. Please check your network and try again.');
    }
    
    if (!supabase) {
      throw new Error('Authentication service not configured properly.');
    }
    
    if (!name || !email || !password) {
      throw new Error('Please fill in all required fields.');
    }
    
    if (!isValidEmail(email)) {
      throw new Error('Please enter a valid email address.');
    }
    
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    
    // Attempt sign up with timeout
    const signUpPromise = supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name
        }
      }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
    );
    
    const { data, error } = await Promise.race([signUpPromise, timeoutPromise]);
    
    if (error) {
      switch (error.message) {
        case 'User already registered':
          throw new Error('An account with this email already exists. Please sign in instead.');
        case 'Password should be at least 6 characters':
          throw new Error('Password must be at least 6 characters long.');
        default:
          throw new Error(error.message || 'Failed to create account. Please try again.');
      }
    }
    
    if (data?.user) {
      if (data.user.email_confirmed_at) {
        // Email already confirmed, redirect to app
        showSuccess('Account created successfully! Redirecting...');
        setTimeout(() => {
          window.location.href = 'app.html';
        }, 1500);
      } else {
        // Email confirmation required
        showSuccess('Account created! Please check your email and click the confirmation link before signing in.');
        setTimeout(() => {
          switchTab('signin');
        }, 3000);
      }
    } else {
      throw new Error('Account creation failed. Please try again.');
    }
    
  } catch (error) {
    console.error('Sign up error:', error);
    
    if (error.message.includes('fetch')) {
      showError('Network error. Please check your internet connection and try again.');
    } else if (error.message.includes('JSON')) {
      showError('Service temporarily unavailable. Please try again in a few moments.');
    } else {
      showError(error.message || 'Sign up failed. Please try again.');
    }
  } finally {
    setLoading('signup', false);
  }
}

// Network status detection
window.addEventListener('online', () => {
  clearMessages();
  showSuccess('Connection restored!');
});

window.addEventListener('offline', () => {
  showError('You are offline. Please check your internet connection.');
});

// Enhanced Supabase initialization with error handling
let supabase = null;
try {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
    
    // Test connection
    supabase.auth.getSession().catch(error => {
      console.warn('Supabase connection test failed:', error);
    });
  }
} catch (error) {
  console.error('Failed to initialize Supabase:', error);
}

// OAuth functions with better error handling
async function signInWithGoogle() {
  try {
    if (!navigator.onLine) {
      throw new Error('No internet connection available.');
    }
    
    if (!supabase) {
      throw new Error('Authentication service not available.');
    }
    
    showSuccess('Redirecting to Google...');
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app.html`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    
    if (error) throw error;
    
  } catch (error) {
    console.error('Google sign in error:', error);
    showError(error.message || 'Google sign in failed. Please try again.');
  }
}

async function signInWithGitHub() {
  try {
    if (!navigator.onLine) {
      throw new Error('No internet connection available.');
    }
    
    if (!supabase) {
      throw new Error('Authentication service not available.');
    }
    
    showSuccess('Redirecting to GitHub...');
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/app.html`
      }
    });
    
    if (error) throw error;
    
  } catch (error) {
    console.error('GitHub sign in error:', error);
    showError(error.message || 'GitHub sign in failed. Please try again.');
  }
}


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


