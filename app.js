/* 
 * Academic Hub X - Complete Application Logic
 * Enhanced with robust error handling, QR scanning, and production-ready features
 */

// =================== CONFIGURATION ===================
const SUPABASE_URL = 'https://yvlspahwnnzfctqqlmbu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHNwYWh3bm56ZmN0cXFsbWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjQ4NzUsImV4cCI6MjA2OTk0MDg3NX0.5j6phM4WCe7XZo5xHdajwAShkV-hibECc_sp31JI6SQ';

// Constants
const APP_NAME = 'Academic Hub X';
const DB_NAME = 'ahx_db';
const DB_VERSION = 3;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// =================== GLOBAL NAMESPACE ===================
window.AHX = {
  state: {
    subjects: [],
    db: null,
    user: null,
    theme: 'light',
    isOnline: navigator.onLine,
    lastSync: null,
    settings: {
      autoSync: true,
      notifications: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'jpg', 'png']
    }
  },
  util: {},
  auth: {},
  files: {},
  ui: {},
  view: {},
  sync: {},
  qr: {},
  analytics: {}
};

// =================== SUPABASE INITIALIZATION ===================
let supabase = null;
let deferredPrompt = null;

try {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      global: {
        headers: {
          'X-Client-Info': `${APP_NAME}/1.0.0`
        }
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

// =================== PWA INSTALL PROMPT ===================
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  console.log('PWA installed successfully');
  deferredPrompt = null;
  AHX.analytics.track('app_installed');
});

// =================== UTILITIES PIPELINE ===================
AHX.util.html = (strings, ...vals) => strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');

AHX.util.bytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

AHX.util.formatDate = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
};

AHX.util.debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

AHX.util.sanitizeFileName = (name) => {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

AHX.util.generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

AHX.util.validateFile = (file) => {
  const errors = [];
  
  if (file.size > AHX.state.settings.maxFileSize) {
    errors.push(`File size exceeds ${AHX.util.bytes(AHX.state.settings.maxFileSize)} limit`);
  }
  
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && !AHX.state.settings.allowedTypes.includes(extension)) {
    errors.push(`File type .${extension} is not allowed`);
  }
  
  return errors;
};

// =================== ERROR HANDLING ===================
AHX.util.handleError = (error, context = '') => {
  console.error(`Error in ${context}:`, error);
  
  let userMessage = 'An unexpected error occurred';
  
  if (!navigator.onLine) {
    userMessage = 'No internet connection. Please check your network.';
  } else if (error.message?.includes('fetch')) {
    userMessage = 'Network error. Please try again.';
  } else if (error.message?.includes('JSON')) {
    userMessage = 'Service temporarily unavailable. Please try again later.';
  } else if (error.message) {
    userMessage = error.message;
  }
  
  AHX.ui.showNotification(userMessage, 'error');
  AHX.analytics.track('error_occurred', { context, error: error.message });
};

// =================== AUTHENTICATION PIPELINE ===================
AHX.auth.current = () => {
  try {
    const raw = localStorage.getItem('ahx_user');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to parse stored user data:', error);
    localStorage.removeItem('ahx_user');
    return null;
  }
};

AHX.auth.getSession = async () => {
  try {
    if (!supabase) return null;
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    console.warn('Failed to get session:', error);
    return null;
  }
};

AHX.auth.signIn = async (email, password) => {
  try {
    if (!supabase) throw new Error('Authentication service not available');
    if (!navigator.onLine) throw new Error('No internet connection');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    
    if (error) throw error;
    
    if (data?.user) {
      const userData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
        avatar: data.user.user_metadata?.avatar_url,
        created_at: data.user.created_at
      };
      
      localStorage.setItem('ahx_user', JSON.stringify(userData));
      AHX.state.user = userData;
      
      AHX.analytics.track('user_signed_in');
      return { success: true, user: userData };
    }
    
    throw new Error('Authentication failed');
  } catch (error) {
    AHX.util.handleError(error, 'signIn');
    return { success: false, error: error.message };
  }
};

AHX.auth.signUp = async (name, email, password) => {
  try {
    if (!supabase) throw new Error('Authentication service not available');
    if (!navigator.onLine) throw new Error('No internet connection');
    
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() }
      }
    });
    
    if (error) throw error;
    
    AHX.analytics.track('user_signed_up');
    return { success: true, data };
  } catch (error) {
    AHX.util.handleError(error, 'signUp');
    return { success: false, error: error.message };
  }
};

AHX.auth.signOut = async () => {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch (error) {
    console.warn('Supabase signout failed:', error);
  } finally {
    localStorage.removeItem('ahx_user');
    localStorage.removeItem('ahx_session');
    AHX.state.user = null;
    AHX.analytics.track('user_signed_out');
    window.location.href = 'index.html';
  }
};

AHX.auth.resetPassword = async (email) => {
  try {
    if (!supabase) throw new Error('Authentication service not available');
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`
    });
    
    if (error) throw error;
    return { success: true };
  } catch (error) {
    AHX.util.handleError(error, 'resetPassword');
    return { success: false, error: error.message };
  }
};

// =================== DATABASE PIPELINE ===================
AHX.files.openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    
    // Files store
    if (!db.objectStoreNames.contains('files')) {
      const filesStore = db.createObjectStore('files', { keyPath: 'id' });
      filesStore.createIndex('by_subject', 'subjectKey', { unique: false });
      filesStore.createIndex('by_name', 'name', { unique: false });
      filesStore.createIndex('by_date', 'addedAt', { unique: false });
      filesStore.createIndex('by_type', 'type', { unique: false });
    }
    
    // Settings store
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }
    
    // Analytics store
    if (!db.objectStoreNames.contains('analytics')) {
      const analyticsStore = db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
      analyticsStore.createIndex('by_event', 'event', { unique: false });
      analyticsStore.createIndex('by_date', 'timestamp', { unique: false });
    }
  };
  
  request.onsuccess = () => {
    resolve(request.result);
  };
  
  request.onerror = () => {
    reject(new Error('Failed to open IndexedDB'));
  };
});

AHX.files.add = async (records) => {
  try {
    const tx = AHX.state.db.transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    
    const promises = records.map(record => {
      return new Promise((resolve, reject) => {
        // Add metadata
        record.addedAt = record.addedAt || Date.now();
        record.updatedAt = Date.now();
        record.synced = false;
        record.version = 1;
        
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      });
    });
    
    const results = await Promise.all(promises);
    await new Promise(resolve => tx.oncomplete = resolve);
    
    AHX.analytics.track('files_added', { count: records.length });
    return results;
  } catch (error) {
    AHX.util.handleError(error, 'files.add');
    throw error;
  }
};

AHX.files.get = async (id) => {
  try {
    return new Promise((resolve, reject) => {
      const tx = AHX.state.db.transaction(['files'], 'readonly');
      const store = tx.objectStore('files');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    AHX.util.handleError(error, 'files.get');
    throw error;
  }
};

AHX.files.listBySubject = async (subjectKey) => {
  try {
    return new Promise((resolve, reject) => {
      const results = [];
      const tx = AHX.state.db.transaction(['files'], 'readonly');
      const store = tx.objectStore('files');
      const index = store.index('by_subject');
      const request = index.openCursor(IDBKeyRange.only(subjectKey));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results.sort((a, b) => b.addedAt - a.addedAt));
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    AHX.util.handleError(error, 'files.listBySubject');
    return [];
  }
};

AHX.files.search = async (query) => {
  try {
    const allFiles = await AHX.files.all();
    const searchTerm = query.toLowerCase();
    
    return allFiles.filter(file => 
      file.name.toLowerCase().includes(searchTerm) ||
      (file.description && file.description.toLowerCase().includes(searchTerm)) ||
      (file.tags && file.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );
  } catch (error) {
    AHX.util.handleError(error, 'files.search');
    return [];
  }
};

AHX.files.all = async () => {
  try {
    return new Promise((resolve, reject) => {
      const results = [];
      const tx = AHX.state.db.transaction(['files'], 'readonly');
      const store = tx.objectStore('files');
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    AHX.util.handleError(error, 'files.all');
    return [];
  }
};

AHX.files.remove = async (id) => {
  try {
    const tx = AHX.state.db.transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    await new Promise(resolve => tx.oncomplete = resolve);
    AHX.analytics.track('file_deleted');
    return true;
  } catch (error) {
    AHX.util.handleError(error, 'files.remove');
    throw error;
  }
};

AHX.files.update = async (id, updates) => {
  try {
    const file = await AHX.files.get(id);
    if (!file) throw new Error('File not found');
    
    const updatedFile = {
      ...file,
      ...updates,
      updatedAt: Date.now(),
      version: (file.version || 1) + 1
    };
    
    await AHX.files.add([updatedFile]);
    return updatedFile;
  } catch (error) {
    AHX.util.handleError(error, 'files.update');
    throw error;
  }
};

AHX.files.getStats = async () => {
  try {
    const files = await AHX.files.all();
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const subjectCounts = {};
    
    files.forEach(file => {
      subjectCounts[file.subjectKey] = (subjectCounts[file.subjectKey] || 0) + 1;
    });
    
    return {
      total: files.length,
      totalSize,
      subjectCounts,
      recentCount: files.filter(f => Date.now() - f.addedAt < 7 * 24 * 60 * 60 * 1000).length
    };
  } catch (error) {
    AHX.util.handleError(error, 'files.getStats');
    return { total: 0, totalSize: 0, subjectCounts: {}, recentCount: 0 };
  }
};

// =================== FILE UPLOAD PIPELINE ===================
AHX.files.saveUploads = async () => {
  try {
    const subjectKey = document.getElementById('uploadSubject')?.value;
    const input = document.getElementById('uploadFiles');
    const files = Array.from(input?.files || []);
    
    if (!files.length) {
      throw new Error('Please select at least one file');
    }
    
    if (!subjectKey) {
      throw new Error('Please select a subject');
    }
    
    // Validate files
    const validationErrors = [];
    files.forEach(file => {
      const errors = AHX.util.validateFile(file);
      if (errors.length) {
        validationErrors.push(`${file.name}: ${errors.join(', ')}`);
      }
    });
    
    if (validationErrors.length) {
      throw new Error('File validation failed:\n' + validationErrors.join('\n'));
    }
    
    // Show progress
    AHX.ui.showProgress('Uploading files...', 0);
    
    const records = await Promise.all(files.map(async (file, index) => {
      try {
        const buffer = await file.arrayBuffer();
        const progress = ((index + 1) / files.length) * 100;
        AHX.ui.updateProgress(progress);
        
        return {
          id: AHX.util.generateId(),
          subjectKey,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          addedAt: Date.now(),
          blob: new Blob([buffer], { type: file.type }),
          description: '',
          tags: [],
          favorite: false
        };
      } catch (error) {
        throw new Error(`Failed to process ${file.name}: ${error.message}`);
      }
    }));
    
    await AHX.files.add(records);
    AHX.ui.hideProgress();
    AHX.ui.closeUpload();
    AHX.ui.showNotification(`Successfully uploaded ${files.length} file(s)`, 'success');
    
    // Refresh current view if on subject page
    const { name, param } = AHX.view.getRoute();
    if (name === 'subject' && param === subjectKey) {
      await AHX.view.render();
    }
    
    return records;
  } catch (error) {
    AHX.ui.hideProgress();
    AHX.util.handleError(error, 'files.saveUploads');
    throw error;
  }
};

// =================== QR CODE PIPELINE ===================
AHX.qr.scanner = null;

AHX.qr.startScanner = async () => {
  try {
    if (typeof Html5Qrcode === 'undefined') {
      throw new Error('QR Scanner library not loaded');
    }
    
    const qrReader = document.getElementById('qr-reader');
    if (!qrReader) throw new Error('QR reader element not found');
    
    AHX.qr.scanner = new Html5Qrcode("qr-reader");
    
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) throw new Error('No cameras found');
    
    // Prefer back camera
    const backCamera = cameras.find(camera => 
      camera.label.toLowerCase().includes('back') || 
      camera.label.toLowerCase().includes('rear')
    ) || cameras[0];
    
    await AHX.qr.scanner.start(
      backCamera.id,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      AHX.qr.onScanSuccess,
      AHX.qr.onScanFailure
    );
    
    return true;
  } catch (error) {
    AHX.util.handleError(error, 'qr.startScanner');
    return false;
  }
};

AHX.qr.stopScanner = async () => {
  try {
    if (AHX.qr.scanner) {
      await AHX.qr.scanner.stop();
      AHX.qr.scanner.clear();
      AHX.qr.scanner = null;
    }
  } catch (error) {
    console.warn('QR scanner stop error:', error);
  }
};

AHX.qr.onScanSuccess = async (decodedText, decodedResult) => {
  try {
    AHX.analytics.track('qr_scan_success');
    await AHX.qr.handleScanResult(decodedText);
    AHX.ui.closeQRScanner();
  } catch (error) {
    AHX.util.handleError(error, 'qr.onScanSuccess');
  }
};

AHX.qr.onScanFailure = (error) => {
  // Silent handling of scan failures (normal when no QR code is visible)
};

AHX.qr.handleScanResult = async (qrData) => {
  try {
    let fileInfo;
    
    if (qrData.startsWith('http')) {
      // URL - create a link file
      fileInfo = {
        name: 'Scanned Link',
        url: qrData,
        type: 'url',
        description: 'Scanned from QR code'
      };
    } else if (qrData.startsWith('{')) {
      // JSON data
      fileInfo = JSON.parse(qrData);
    } else {
      // Plain text - create a note
      fileInfo = {
        name: 'Scanned Note',
        content: qrData,
        type: 'note',
        description: 'Text scanned from QR code'
      };
    }
    
    // Create file record
    const record = {
      id: AHX.util.generateId(),
      subjectKey: 'scanned',
      name: fileInfo.name || 'Scanned Content',
      type: fileInfo.type || 'scanned',
      size: new Blob([qrData]).size,
      addedAt: Date.now(),
      qrData: qrData,
      url: fileInfo.url,
      content: fileInfo.content,
      description: fileInfo.description || 'Scanned from QR code',
      tags: ['qr-scanned'],
      favorite: false
    };
    
    await AHX.files.add([record]);
    AHX.ui.showNotification('QR content saved successfully!', 'success');
    
    // Refresh view if on scanned files page
    const { name, param } = AHX.view.getRoute();
    if ((name === 'subject' && param === 'scanned') || name === 'dashboard') {
      await AHX.view.render();
    }
    
  } catch (error) {
    throw new Error('Failed to process QR data: ' + error.message);
  }
};

// =================== UI PIPELINE ===================
AHX.ui.showNotification = (message, type = 'info', duration = 5000) => {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto remove
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, duration);
};

AHX.ui.showProgress = (message, progress = 0) => {
  let progressModal = document.getElementById('progressModal');
  if (!progressModal) {
    progressModal = document.createElement('div');
    progressModal.id = 'progressModal';
    progressModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="progress-panel">
        <div class="progress-message">${message}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-text">${Math.round(progress)}%</div>
      </div>
    `;
    progressModal.className = 'modal';
    document.body.appendChild(progressModal);
  }
  
  AHX.ui.updateProgress(progress);
};

AHX.ui.updateProgress = (progress) => {
  const progressFill = document.querySelector('#progressModal .progress-fill');
  const progressText = document.querySelector('#progressModal .progress-text');
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = `${Math.round(progress)}%`;
};

AHX.ui.hideProgress = () => {
  const progressModal = document.getElementById('progressModal');
  if (progressModal) progressModal.remove();
};

AHX.ui.openUpload = (subjectKey) => {
  const modal = document.getElementById('uploadModal');
  const subjectSelect = document.getElementById('uploadSubject');
  
  if (modal) {
    if (subjectKey && subjectSelect) {
      subjectSelect.value = subjectKey;
    }
    modal.classList.remove('hidden');
  }
};

AHX.ui.closeUpload = () => {
  const modal = document.getElementById('uploadModal');
  const input = document.getElementById('uploadFiles');
  
  if (input) input.value = '';
  if (modal) modal.classList.add('hidden');
};

AHX.ui.openQRScanner = async () => {
  const modal = document.getElementById('qrModal');
  if (modal) {
    modal.classList.add('active');
    await AHX.qr.startScanner();
  }
};

AHX.ui.closeQRScanner = async () => {
  const modal = document.getElementById('qrModal');
  if (modal) {
    modal.classList.remove('active');
    await AHX.qr.stopScanner();
  }
};

AHX.ui.toggleTheme = () => {
  const root = document.documentElement;
  const currentTheme = root.classList.contains('dark') ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  root.classList.toggle('dark');
  AHX.state.theme = newTheme;
  
  try {
    localStorage.setItem('ahx_theme', newTheme);
  } catch (error) {
    console.warn('Failed to save theme preference:', error);
  }
  
  AHX.analytics.track('theme_changed', { theme: newTheme });
};

AHX.ui.installPWA = async () => {
  try {
    if (deferredPrompt) {
      const result = await deferredPrompt.prompt();
      deferredPrompt = null;
      
      const installBtn = document.getElementById('installBtn');
      if (installBtn) installBtn.classList.add('hidden');
      
      AHX.analytics.track('pwa_install_prompted', { outcome: result.outcome });
    }
  } catch (error) {
    AHX.util.handleError(error, 'ui.installPWA');
  }
};

// =================== ROUTING PIPELINE ===================
AHX.view.getRoute = () => {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts[0] || 'dashboard', param: parts[1] || null, params: parts.slice(1) };
};

AHX.view.render = async () => {
  try {
    const root = document.getElementById('viewRoot');
    if (!root) return;
    
    const { name, param } = AHX.view.getRoute();
    
    // Auth check
    if (!AHX.auth.current()) {
      window.location.href = 'index.html';
      return;
    }
    
    // Show loading
    root.innerHTML = '<div class="loading-container"><div class="loader"></div><p>Loading...</p></div>';
    
    const fab = document.getElementById('fab');
    
    switch (name) {
      case 'dashboard':
        root.innerHTML = await AHX.view.dashboard();
        fab?.classList.remove('hidden');
        break;
        
      case 'subject':
        if (param) {
          const subject = AHX.state.subjects.find(s => s.key === param);
          if (subject) {
            root.innerHTML = await AHX.view.subject(subject);
            fab?.classList.remove('hidden');
          } else {
            location.hash = '#/dashboard';
            return;
          }
        } else {
          root.innerHTML = await AHX.view.subjects();
          fab?.classList.add('hidden');
        }
        break;
        
      case 'search':
        root.innerHTML = await AHX.view.search();
        fab?.classList.add('hidden');
        break;
        
      case 'analytics':
        root.innerHTML = await AHX.view.analytics();
        fab?.classList.add('hidden');
        break;
        
      case 'settings':
        root.innerHTML = await AHX.view.settings();
        fab?.classList.add('hidden');
        break;
        
      default:
        location.hash = '#/dashboard';
        return;
    }
    
    AHX.analytics.track('page_view', { page: name, param });
  } catch (error) {
    AHX.util.handleError(error, 'view.render');
    const root = document.getElementById('viewRoot');
    if (root) {
      root.innerHTML = `
        <div class="error-container">
          <h2>Something went wrong</h2>
          <p>Please refresh the page or try again later.</p>
          <button onclick="location.reload()" class="btn-primary">Refresh Page</button>
        </div>
      `;
    }
  }
};

// =================== VIEW TEMPLATES ===================
AHX.view.dashboard = async () => {
  const stats = await AHX.files.getStats();
  const recentFiles = (await AHX.files.all()).slice(0, 5);
  
  return AHX.util.html`
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome back, ${AHX.state.user?.name || 'User'}!</p>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📁</div>
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Files</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-value">${AHX.state.subjects.length}</div>
          <div class="stat-label">Subjects</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💾</div>
          <div class="stat-value">${AHX.util.bytes(stats.totalSize)}</div>
          <div class="stat-label">Storage Used</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📈</div>
          <div class="stat-value">${stats.recentCount}</div>
          <div class="stat-label">Recent Files</div>
        </div>
      </div>
      
      <div class="content-grid">
        <div class="recent-section">
          <h2>Recent Files</h2>
          <div class="file-list">
            ${recentFiles.map(file => `
              <div class="file-item" onclick="AHX.view.openFile('${file.id}')">
                <div class="file-icon">${AHX.view.getFileIcon(file.type)}</div>
                <div class="file-info">
                  <div class="file-name">${file.name}</div>
                  <div class="file-meta">${AHX.util.formatDate(file.addedAt)} • ${AHX.util.bytes(file.size)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="subjects-section">
          <h2>Subjects</h2>
          <div class="subject-grid">
            ${AHX.state.subjects.map(subject => `
              <div class="subject-card" onclick="location.hash='#/subject/${subject.key}'">
                <div class="subject-icon">${subject.icon || '📚'}</div>
                <div class="subject-name">${subject.name}</div>
                <div class="subject-count">${stats.subjectCounts[subject.key] || 0} files</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
};

AHX.view.subject = async (subject) => {
  const files = await AHX.files.listBySubject(subject.key);
  
  return AHX.util.html`
    <div class="subject-view">
      <div class="subject-header">
        <button onclick="history.back()" class="back-btn">←</button>
        <div class="subject-info">
          <h1>${subject.name}</h1>
          <p>${subject.description || `${files.length} files`}</p>
        </div>
        <button onclick="AHX.ui.openUpload('${subject.key}')" class="btn-primary">Add Files</button>
      </div>
      
      <div class="file-grid">
        ${files.map(file => `
          <div class="file-card" onclick="AHX.view.openFile('${file.id}')">
            <div class="file-preview">${AHX.view.getFileIcon(file.type)}</div>
            <div class="file-details">
              <div class="file-name">${file.name}</div>
              <div class="file-meta">
                ${AHX.util.formatDate(file.addedAt)} • ${AHX.util.bytes(file.size)}
              </div>
            </div>
            <div class="file-actions">
              <button onclick="event.stopPropagation(); AHX.files.remove('${file.id}').then(() => AHX.view.render())" class="btn-danger">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
      
      ${files.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📁</div>
          <h3>No files yet</h3>
          <p>Upload your first file to get started</p>
          <button onclick="AHX.ui.openUpload('${subject.key}')" class="btn-primary">Upload Files</button>
        </div>
      ` : ''}
    </div>
  `;
};

AHX.view.search = async () => {
  return AHX.util.html`
    <div class="search-view">
      <div class="search-header">
        <h1>Search Files</h1>
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="Search by filename, content, or tags..." class="search-input">
          <button onclick="AHX.view.performSearch()" class="search-btn">Search</button>
        </div>
      </div>
      
      <div id="searchResults" class="search-results">
        <div class="empty-search">
          <div class="search-icon">🔍</div>
          <p>Enter a search term to find your files</p>
        </div>
      </div>
    </div>
  `;
};

AHX.view.settings = async () => {
  const stats = await AHX.files.getStats();
  
  return AHX.util.html`
    <div class="settings-view">
      <div class="settings-header">
        <h1>Settings</h1>
      </div>
      
      <div class="settings-sections">
        <div class="settings-section">
          <h2>Account</h2>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Email</div>
              <div class="setting-value">${AHX.state.user?.email}</div>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Name</div>
              <div class="setting-value">${AHX.state.user?.name}</div>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h2>Storage</h2>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Total Files</div>
              <div class="setting-value">${stats.total}</div>
            </div>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Storage Used</div>
              <div class="setting-value">${AHX.util.bytes(stats.totalSize)}</div>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h2>Preferences</h2>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Theme</div>
              <div class="setting-value">
                <button onclick="AHX.ui.toggleTheme()" class="btn">${AHX.state.theme === 'dark' ? 'Dark' : 'Light'}</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h2>Data Management</h2>
          <div class="setting-item">
            <button onclick="AHX.files.exportData()" class="btn">Export Data</button>
            <button onclick="AHX.files.clearAll()" class="btn-danger">Clear All Data</button>
          </div>
        </div>
        
        <div class="settings-section">
          <h2>Account Actions</h2>
          <div class="setting-item">
            <button onclick="AHX.auth.signOut()" class="btn-danger">Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

AHX.view.getFileIcon = (type) => {
  const icons = {
    'application/pdf': '📄',
    'application/msword': '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'application/vnd.ms-powerpoint': '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
    'image/jpeg': '🖼️',
    'image/png': '🖼️',
    'image/gif': '🖼️',
    'text/plain': '📄',
    'url': '🔗',
    'note': '📝',
    'scanned': '📷'
  };
  
  return icons[type] || '📄';
};

AHX.view.openFile = async (id) => {
  try {
    const file = await AHX.files.get(id);
    if (!file) throw new Error('File not found');
    
    if (file.url) {
      window.open(file.url, '_blank');
    } else if (file.blob) {
      const url = URL.createObjectURL(file.blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (file.content) {
      alert(file.content);
    } else {
      throw new Error('Cannot open file: No content available');
    }
    
    AHX.analytics.track('file_opened', { fileType: file.type });
  } catch (error) {
    AHX.util.handleError(error, 'view.openFile');
  }
};

AHX.view.performSearch = AHX.util.debounce(async () => {
  const query = document.getElementById('searchInput')?.value?.trim();
  const resultsContainer = document.getElementById('searchResults');
  
  if (!query || !resultsContainer) return;
  
  try {
    resultsContainer.innerHTML = '<div class="loading-container"><div class="loader"></div></div>';
    
    const results = await AHX.files.search(query);
    
    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-search">
          <div class="search-icon">🔍</div>
          <p>No files found for "${query}"</p>
        </div>
      `;
      return;
    }
    
    resultsContainer.innerHTML = `
      <div class="search-results-list">
        ${results.map(file => `
          <div class="file-item" onclick="AHX.view.openFile('${file.id}')">
            <div class="file-icon">${AHX.view.getFileIcon(file.type)}</div>
            <div class="file-info">
              <div class="file-name">${file.name}</div>
              <div class="file-meta">
                ${AHX.state.subjects.find(s => s.key === file.subjectKey)?.name || file.subjectKey} • 
                ${AHX.util.formatDate(file.addedAt)} • 
                ${AHX.util.bytes(file.size)}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    AHX.analytics.track('search_performed', { query, resultCount: results.length });
  } catch (error) {
    AHX.util.handleError(error, 'view.performSearch');
    resultsContainer.innerHTML = '<div class="error-message">Search failed. Please try again.</div>';
  }
}, 300);

// =================== ANALYTICS PIPELINE ===================
AHX.analytics.track = async (event, data = {}) => {
  try {
    const record = {
      event,
      data,
      timestamp: Date.now(),
      user: AHX.state.user?.id || 'anonymous',
      session: Date.now().toString(36)
    };
    
    // Store locally
    const tx = AHX.state.db?.transaction(['analytics'], 'readwrite');
    if (tx) {
      const store = tx.objectStore('analytics');
      store.add(record);
    }
    
    console.log('Analytics:', event, data);
  } catch (error) {
    console.warn('Analytics tracking failed:', error);
  }
};

// =================== INITIALIZATION PIPELINE ===================
const initializeApp = async () => {
  try {
    // Theme initialization
    const savedTheme = localStorage.getItem('ahx_theme');
    if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      AHX.state.theme = 'dark';
    }
    
    // Service worker registration
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.warn('Service Worker registration failed:', error);
      }
    }
    
    // Load subjects
    try {
      const response = await fetch('subjects.json');
      if (response.ok) {
        AHX.state.subjects = await response.json();
      }
    } catch (error) {
      console.warn('Failed to load subjects:', error);
      // Fallback subjects
      AHX.state.subjects = [
        { key: 'math', name: 'Mathematics', code: 'MATH', icon: '🔢' },
        { key: 'science', name: 'Science', code: 'SCI', icon: '🔬' },
        { key: 'english', name: 'English', code: 'ENG', icon: '📚' },
        { key: 'scanned', name: 'Scanned Notes', code: 'SCAN', icon: '📷' }
      ];
    }
    
    // Open IndexedDB
    try {
      AHX.state.db = await AHX.files.openDB();
    } catch (error) {
      console.error('Failed to open IndexedDB:', error);
      AHX.ui.showNotification('Local storage unavailable. Files will not persist.', 'warning');
    }
    
    // Initialize UI
    setupEventListeners();
    
    // Check authentication
    AHX.state.user = AHX.auth.current();
    if (!AHX.state.user) {
      window.location.href = 'index.html';
      return;
    }
    
    // Setup routing
    window.addEventListener('hashchange', AHX.view.render);
    if (!location.hash) location.hash = '#/dashboard';
    
    // Initial render
    await AHX.view.render();
    
    // Network status monitoring
    window.addEventListener('online', () => {
      AHX.state.isOnline = true;
      AHX.ui.showNotification('Connection restored', 'success', 3000);
    });
    
    window.addEventListener('offline', () => {
      AHX.state.isOnline = false;
      AHX.ui.showNotification('You are offline', 'warning', 3000);
    });
    
    AHX.analytics.track('app_initialized');
    
  } catch (error) {
    console.error('App initialization failed:', error);
    AHX.ui.showNotification('Failed to initialize app. Please refresh.', 'error');
  }
};

const setupEventListeners = () => {
  // Theme toggle
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', AHX.ui.toggleTheme);
  
  // Install PWA
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.addEventListener('click', AHX.ui.installPWA);
  
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', AHX.auth.signOut);
  
  // Upload modal
  const fabBtn = document.getElementById('fab');
  if (fabBtn) fabBtn.addEventListener('click', () => AHX.ui.openUpload());
  
  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', AHX.view.performSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') AHX.view.performSearch();
    });
  }
  
  // File drag and drop
  setupDragAndDrop();
};

const setupDragAndDrop = () => {
  const uploadArea = document.querySelector('.upload-area');
  if (!uploadArea) return;
  
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  
  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      const fileInput = document.getElementById('uploadFiles');
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
      }
    }
  });
};

// =================== APP BOOT ===================
document.addEventListener('DOMContentLoaded', initializeApp);

// Export for debugging
window.AHX = AHX;
