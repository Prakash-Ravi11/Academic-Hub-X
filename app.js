/* 
 * Academic Hub X - Complete Application Logic
 * Production-ready with robust error handling, offline support, and QR integration
 */

// =================== CONFIGURATION ===================
const SUPABASE_URL = 'https://yvlspahwnnzfctqqlmbu.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bHNwYWh3bm56ZmN0cXFsbWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNjQ4NzUsImV4cCI6MjA2OTk0MDg3NX0.5j6phM4WCe7XZo5xHdajwAShkV-hibECc_sp31JI6SQ';

const APP_CONFIG = {
  name: 'Academic Hub X',
  version: '1.0.0',
  dbName: 'ahx_db',
  dbVersion: 3,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedTypes: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'jpg', 'png', 'gif'],
  defaultSubjects: [
    { key: 'math', name: 'Mathematics', code: 'MATH', icon: '🔢' },
    { key: 'science', name: 'Science', code: 'SCI', icon: '🔬' },
    { key: 'english', name: 'English', code: 'ENG', icon: '📚' },
    { key: 'history', name: 'History', code: 'HIST', icon: '📜' },
    { key: 'scanned', name: 'Scanned Notes', code: 'SCAN', icon: '📷' }
  ]
};

// =================== GLOBAL NAMESPACE ===================
window.AHX = {
  state: {
    subjects: [...APP_CONFIG.defaultSubjects],
    db: null,
    user: null,
    theme: 'light',
    isOnline: navigator.onLine,
    currentRoute: null,
    isInitialized: false
  },
  util: {},
  auth: {},
  files: {},
  ui: {},
  view: {},
  qr: {}
};

let supabase = null;

// =================== INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  try {
    console.log('Initializing Academic Hub X...');
    
    // Check authentication first
    const user = AHX.auth.current();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    
    AHX.state.user = user;
    updateUserDisplay();
    
    // Initialize Supabase with timeout
    await initializeSupabase();
    
    // Initialize IndexedDB
    await initializeDatabase();
    
    // Setup UI event listeners
    setupEventListeners();
    
    // Initialize routing
    setupRouting();
    
    // Load subjects from file
    await loadSubjects();
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Network status monitoring
    setupNetworkMonitoring();
    
    // Mark as initialized
    AHX.state.isInitialized = true;
    
    // Initial render
    await AHX.view.render();
    
    console.log('Academic Hub X initialized successfully');
    
  } catch (error) {
    console.error('App initialization failed:', error);
    AHX.ui.showNotification('Failed to initialize app. Some features may be unavailable.', 'error');
    
    // Still try to render basic UI
    try {
      await AHX.view.render();
    } catch (renderError) {
      console.error('Emergency render failed:', renderError);
      document.getElementById('viewRoot').innerHTML = `
        <div class="error-state">
          <h2>App Failed to Load</h2>
          <p>Please refresh the page or check your connection.</p>
          <button class="btn btn-primary" onclick="location.reload()">Refresh Page</button>
        </div>
      `;
    }
  }
}

async function initializeSupabase() {
  try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false // Prevent URL parsing errors
        }
      });
      console.log('Supabase initialized');
    }
  } catch (error) {
    console.warn('Supabase initialization failed:', error);
  }
}

async function initializeDatabase() {
  try {
    AHX.state.db = await AHX.files.openDB();
    console.log('IndexedDB initialized');
  } catch (error) {
    console.error('IndexedDB initialization failed:', error);
    AHX.ui.showNotification('Local storage unavailable. Files will not persist.', 'warning');
  }
}

// =================== AUTHENTICATION ===================
AHX.auth.current = () => {
  try {
    const raw = localStorage.getItem('ahx_user');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to parse user data:', error);
    localStorage.removeItem('ahx_user');
    return null;
  }
};

AHX.auth.signOut = async () => {
  try {
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.warn('Supabase signout failed:', error);
  } finally {
    localStorage.removeItem('ahx_user');
    localStorage.removeItem('ahx_session');
    window.location.href = 'index.html';
  }
};

// =================== UTILITIES ===================
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

AHX.util.generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

AHX.util.validateFile = (file) => {
  const errors = [];
  
  if (file.size > APP_CONFIG.maxFileSize) {
    errors.push(`File size exceeds ${AHX.util.bytes(APP_CONFIG.maxFileSize)} limit`);
  }
  
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && !APP_CONFIG.allowedTypes.includes(extension)) {
    errors.push(`File type .${extension} is not allowed`);
  }
  
  return errors;
};

// =================== DATABASE OPERATIONS ===================
AHX.files.openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
  
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    
    if (!db.objectStoreNames.contains('files')) {
      const filesStore = db.createObjectStore('files', { keyPath: 'id' });
      filesStore.createIndex('by_subject', 'subjectKey', { unique: false });
      filesStore.createIndex('by_name', 'name', { unique: false });
      filesStore.createIndex('by_date', 'addedAt', { unique: false });
      filesStore.createIndex('by_type', 'type', { unique: false });
    }
    
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }
  };
  
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('Failed to open IndexedDB'));
});

AHX.files.add = async (records) => {
  try {
    if (!AHX.state.db) throw new Error('Database not available');
    
    const tx = AHX.state.db.transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    
    const promises = records.map(record => {
      record.addedAt = record.addedAt || Date.now();
      record.updatedAt = Date.now();
      
      return new Promise((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      });
    });
    
    const results = await Promise.all(promises);
    await new Promise(resolve => tx.oncomplete = resolve);
    
    return results;
  } catch (error) {
    console.error('Failed to add files:', error);
    throw error;
  }
};

AHX.files.get = async (id) => {
  try {
    if (!AHX.state.db) return null;
    
    return new Promise((resolve, reject) => {
      const tx = AHX.state.db.transaction(['files'], 'readonly');
      const store = tx.objectStore('files');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get file:', error);
    return null;
  }
};

AHX.files.all = async () => {
  try {
    if (!AHX.state.db) return [];
    
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
          resolve(results.sort((a, b) => b.addedAt - a.addedAt));
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get all files:', error);
    return [];
  }
};

AHX.files.listBySubject = async (subjectKey) => {
  try {
    if (!AHX.state.db) return [];
    
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
    console.error('Failed to get files by subject:', error);
    return [];
  }
};

AHX.files.remove = async (id) => {
  try {
    if (!AHX.state.db) throw new Error('Database not available');
    
    const tx = AHX.state.db.transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    await new Promise(resolve => tx.oncomplete = resolve);
    return true;
  } catch (error) {
    console.error('Failed to remove file:', error);
    throw error;
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
    console.error('Search failed:', error);
    return [];
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
    console.error('Failed to get stats:', error);
    return { total: 0, totalSize: 0, subjectCounts: {}, recentCount: 0 };
  }
};

// =================== FILE UPLOAD ===================
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
    }));
    
    await AHX.files.add(records);
    AHX.ui.hideProgress();
    AHX.ui.closeUpload();
    AHX.ui.showNotification(`Successfully uploaded ${files.length} file(s)`, 'success');
    
    // Refresh current view
    const route = AHX.view.getCurrentRoute();
    if (route.name === 'subject' && route.param === subjectKey || route.name === 'dashboard') {
      await AHX.view.render();
    }
    
    return records;
  } catch (error) {
    AHX.ui.hideProgress();
    console.error('Upload failed:', error);
    AHX.ui.showNotification(error.message || 'Upload failed', 'error');
    throw error;
  }
};

// =================== QR CODE SCANNER ===================
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
    console.error('QR scanner start failed:', error);
    AHX.ui.showNotification(error.message || 'Failed to start camera', 'error');
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
    await AHX.qr.handleScanResult(decodedText);
    AHX.ui.closeQRScanner();
  } catch (error) {
    console.error('QR scan processing failed:', error);
    AHX.ui.showNotification('Failed to process QR code', 'error');
  }
};

AHX.qr.onScanFailure = (error) => {
  // Silent handling of scan failures
};

AHX.qr.handleScanResult = async (qrData) => {
  try {
    let fileInfo;
    
    if (qrData.startsWith('http')) {
      fileInfo = {
        name: 'Scanned Link',
        url: qrData,
        type: 'url',
        description: 'Link scanned from QR code'
      };
    } else if (qrData.startsWith('{')) {
      fileInfo = JSON.parse(qrData);
    } else {
      fileInfo = {
        name: 'Scanned Note',
        content: qrData,
        type: 'note',
        description: 'Text scanned from QR code'
      };
    }
    
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
    
    // Refresh view if needed
    const route = AHX.view.getCurrentRoute();
    if ((route.name === 'subject' && route.param === 'scanned') || route.name === 'dashboard') {
      await AHX.view.render();
    }
    
  } catch (error) {
    throw new Error('Failed to process QR data: ' + error.message);
  }
};

// =================== UI MANAGEMENT ===================
AHX.ui.showNotification = (message, type = 'info', duration = 5000) => {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; margin-left: 1rem;">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Show notification
  setTimeout(() => notification.classList.add('show'), 100);
  
  // Auto remove
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, duration);
};

AHX.ui.showProgress = (message, progress = 0) => {
  let progressModal = document.getElementById('progressModal');
  if (!progressModal) {
    progressModal = document.createElement('div');
    progressModal.id = 'progressModal';
    progressModal.className = 'modal active';
    progressModal.innerHTML = `
      <div class="modal-panel">
        <div class="progress-message" style="margin-bottom: 1rem; text-align: center;">${message}</div>
        <div style="background: var(--gray-200); height: 8px; border-radius: 4px; overflow: hidden;">
          <div class="progress-fill" style="height: 100%; background: var(--primary); width: ${progress}%; transition: width 0.3s ease;"></div>
        </div>
        <div class="progress-text" style="text-align: center; margin-top: 0.5rem; font-size: 0.9rem; color: var(--gray-600);">${Math.round(progress)}%</div>
      </div>
    `;
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
    modal.classList.add('active');
  }
};

AHX.ui.closeUpload = () => {
  const modal = document.getElementById('uploadModal');
  const input = document.getElementById('uploadFiles');
  
  if (input) input.value = '';
  if (modal) modal.classList.remove('active');
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

// =================== VIEW SYSTEM ===================
AHX.view.getCurrentRoute = () => {
  const hash = location.hash || '#/dashboard';
  const parts = hash.slice(2).split('/');
  return { name: parts[0] || 'dashboard', param: parts[1] || null };
};

AHX.view.render = async () => {
  try {
    const root = document.getElementById('viewRoot');
    if (!root) return;
    
    const route = AHX.view.getCurrentRoute();
    AHX.state.currentRoute = route;
    
    // Update navigation
    updateNavigation(route.name);
    
    // Show loading
    root.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    
    let content = '';
    
    switch (route.name) {
      case 'dashboard':
        content = await AHX.view.dashboard();
        break;
      case 'subjects':
        content = await AHX.view.subjects();
        break;
      case 'subject':
        if (route.param) {
          const subject = AHX.state.subjects.find(s => s.key === route.param);
          content = subject ? await AHX.view.subject(subject) : await AHX.view.dashboard();
        } else {
          content = await AHX.view.subjects();
        }
        break;
      case 'files':
        content = await AHX.view.allFiles();
        break;
      case 'search':
        content = await AHX.view.search();
        break;
      case 'qr-scanner':
        content = await AHX.view.qrScanner();
        break;
      case 'analytics':
        content = await AHX.view.analytics();
        break;
      case 'settings':
        content = await AHX.view.settings();
        break;
      default:
        location.hash = '#/dashboard';
        return;
    }
    
    root.innerHTML = content;
    
    // Show/hide FAB based on route
    const fab = document.getElementById('fab');
    if (fab) {
      if (['dashboard', 'subjects', 'subject', 'files'].includes(route.name)) {
        fab.classList.remove('hidden');
      } else {
        fab.classList.add('hidden');
      }
    }
    
  } catch (error) {
    console.error('Render error:', error);
    const root = document.getElementById('viewRoot');
    if (root) {
      root.innerHTML = `
        <div class="error-state">
          <div class="empty-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p>Please try refreshing the page</p>
          <button class="btn btn-primary" onclick="location.reload()">Refresh</button>
        </div>
      `;
    }
  }
};

AHX.view.dashboard = async () => {
  const stats = await AHX.files.getStats();
  const recentFiles = (await AHX.files.all()).slice(0, 5);
  
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">Dashboard</h1>
        <p class="header-subtitle">Welcome back, ${AHX.state.user?.name || 'User'}! Here's your academic overview.</p>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="toggleTheme()">🌓</button>
        <button class="btn btn-primary" onclick="AHX.ui.openUpload()">Upload Files</button>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">📁</div>
        </div>
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">📚</div>
        </div>
        <div class="stat-value">${AHX.state.subjects.length}</div>
        <div class="stat-label">Subjects</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">💾</div>
        </div>
        <div class="stat-value">${AHX.util.bytes(stats.totalSize)}</div>
        <div class="stat-label">Storage Used</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">📈</div>
        </div>
        <div class="stat-value">${stats.recentCount}</div>
        <div class="stat-label">Recent Files</div>
      </div>
    </div>
    
    <div class="content-grid">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Recent Files</h2>
        </div>
        <div>
          ${recentFiles.length > 0 ? recentFiles.map(file => `
            <div class="file-item" onclick="AHX.view.openFile('${file.id}')">
              <div class="file-icon">${AHX.view.getFileIcon(file.type)}</div>
              <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${AHX.util.formatDate(file.addedAt)} • ${AHX.util.bytes(file.size)}</div>
              </div>
            </div>
          `).join('') : '<div class="empty-state"><div class="empty-icon">📁</div><p>No files uploaded yet</p></div>'}
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Quick Actions</h2>
        </div>
        <div>
          <button class="action-btn" onclick="AHX.ui.openUpload()">
            <span style="font-size: 1.5rem;">📤</span>
            <div>
              <div style="font-weight: 600;">Upload Files</div>
              <div style="font-size: 0.8rem; color: var(--gray-500);">Add new documents</div>
            </div>
          </button>
          
          <button class="action-btn" onclick="AHX.ui.openQRScanner()">
            <span style="font-size: 1.5rem;">📷</span>
            <div>
              <div style="font-weight: 600;">QR Scanner</div>
              <div style="font-size: 0.8rem; color: var(--gray-500);">Scan college notes</div>
            </div>
          </button>
          
          <button class="action-btn" onclick="location.hash='#/search'">
            <span style="font-size: 1.5rem;">🔍</span>
            <div>
              <div style="font-weight: 600;">Search Files</div>
              <div style="font-size: 0.8rem; color: var(--gray-500);">Find documents</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  `;
};

AHX.view.subjects = async () => {
  const stats = await AHX.files.getStats();
  
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">Subjects</h1>
        <p class="header-subtitle">Organize your files by subject categories</p>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
      ${AHX.state.subjects.map(subject => `
        <div class="card" style="cursor: pointer; transition: var(--transition);" onclick="location.hash='#/subject/${subject.key}'" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
            <div style="font-size: 2rem;">${subject.icon}</div>
            <div>
              <div style="font-size: 1.2rem; font-weight: 600; color: var(--gray-900);">${subject.name}</div>
              <div style="font-size: 0.9rem; color: var(--gray-500);">${subject.code}</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--gray-600);">${stats.subjectCounts[subject.key] || 0} files</span>
            <button class="btn btn-primary" onclick="event.stopPropagation(); AHX.ui.openUpload('${subject.key}')" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Add Files</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

AHX.view.subject = async (subject) => {
  const files = await AHX.files.listBySubject(subject.key);
  
  return AHX.util.html`
    <div class="header">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <button onclick="history.back()" style="background: none; border: 1px solid var(--gray-300); border-radius: var(--radius-small); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;">←</button>
        <div>
          <h1 class="header-title" style="display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 2rem;">${subject.icon}</span>
            ${subject.name}
          </h1>
          <p class="header-subtitle">${subject.code} • ${files.length} files</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="AHX.ui.openUpload('${subject.key}')">Add Files</button>
      </div>
    </div>
    
    ${files.length > 0 ? `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        ${files.map(file => `
          <div class="card" style="cursor: pointer; transition: var(--transition);" onclick="AHX.view.openFile('${file.id}')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
              <div class="file-icon">${AHX.view.getFileIcon(file.type)}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name}</div>
                <div style="font-size: 0.8rem; color: var(--gray-500);">${AHX.util.formatDate(file.addedAt)} • ${AHX.util.bytes(file.size)}</div>
              </div>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button onclick="event.stopPropagation(); AHX.files.remove('${file.id}').then(() => AHX.view.render())" class="btn" style="background: var(--danger); color: white; border: none; padding: 0.4rem 0.8rem; font-size: 0.8rem;">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">${subject.icon}</div>
        <h3>No files in ${subject.name} yet</h3>
        <p>Upload your first ${subject.name.toLowerCase()} file to get started</p>
        <button class="btn btn-primary" onclick="AHX.ui.openUpload('${subject.key}')">Upload Files</button>
      </div>
    `}
  `;
};

AHX.view.allFiles = async () => {
  const files = await AHX.files.all();
  
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">All Files</h1>
        <p class="header-subtitle">Browse all your uploaded documents</p>
      </div>
    </div>
    
    ${files.length > 0 ? `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        ${files.map(file => `
          <div class="card" onclick="AHX.view.openFile('${file.id}')">
            <div class="file-item">
              <div class="file-icon">${AHX.view.getFileIcon(file.type)}</div>
              <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${AHX.state.subjects.find(s => s.key === file.subjectKey)?.name || file.subjectKey} • ${AHX.util.formatDate(file.addedAt)}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No files uploaded yet</h3>
        <p>Start by uploading your first document</p>
        <button class="btn btn-primary" onclick="AHX.ui.openUpload()">Upload Files</button>
      </div>
    `}
  `;
};

AHX.view.search = async () => {
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">Search Files</h1>
        <p class="header-subtitle">Find your documents quickly</p>
      </div>
    </div>
    
    <div class="card" style="margin-bottom: 2rem;">
      <div style="display: flex; gap: 1rem;">
        <input type="text" id="searchInput" placeholder="Search by filename, content, or tags..." style="flex: 1; padding: 1rem; border: 2px solid var(--gray-200); border-radius: var(--radius-medium); font-size: 1rem;">
        <button class="btn btn-primary" onclick="AHX.view.performSearch()">Search</button>
      </div>
    </div>
    
    <div id="searchResults">
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>Enter a search term to find your files</p>
      </div>
    </div>
  `;
};

AHX.view.qrScanner = async () => {
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">QR Code Scanner</h1>
        <p class="header-subtitle">Scan QR codes to save notes and links</p>
      </div>
    </div>
    
    <div class="card">
      <div style="text-align: center; padding: 2rem;">
        <div style="font-size: 4rem; margin-bottom: 2rem;">📷</div>
        <h3>Ready to Scan</h3>
        <p style="margin: 1rem 0 2rem 0; color: var(--gray-500);">Click the button below to start scanning QR codes from your classmates or professors</p>
        <button class="btn btn-primary" onclick="AHX.ui.openQRScanner()">Start QR Scanner</button>
      </div>
    </div>
  `;
};

AHX.view.analytics = async () => {
  const stats = await AHX.files.getStats();
  
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">Analytics</h1>
        <p class="header-subtitle">Insights about your academic files</p>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">📊</div>
        </div>
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">📈</div>
        </div>
        <div class="stat-value">${stats.recentCount}</div>
        <div class="stat-label">This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">💾</div>
        </div>
        <div class="stat-value">${AHX.util.bytes(stats.totalSize)}</div>
        <div class="stat-label">Storage Used</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">⭐</div>
        </div>
        <div class="stat-value">${Object.keys(stats.subjectCounts).length}</div>
        <div class="stat-label">Active Subjects</div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Files by Subject</h2>
      </div>
      <div>
        ${Object.entries(stats.subjectCounts).map(([key, count]) => {
          const subject = AHX.state.subjects.find(s => s.key === key);
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
              <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 1.5rem;">${subject?.icon || '📄'}</span>
                <span style="font-weight: 600;">${subject?.name || key}</span>
              </div>
              <span style="color: var(--gray-600);">${count} files</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
};

AHX.view.settings = async () => {
  const stats = await AHX.files.getStats();
  
  return AHX.util.html`
    <div class="header">
      <div>
        <h1 class="header-title">Settings</h1>
        <p class="header-subtitle">Manage your app preferences and data</p>
      </div>
    </div>
    
    <div style="display: grid; gap: 2rem;">
      <div class="card">
        <h2 style="margin-bottom: 1rem; color: var(--gray-900);">Account Information</h2>
        <div style="display: grid; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
            <div>
              <div style="font-weight: 600;">Email</div>
              <div style="color: var(--gray-500); font-size: 0.9rem;">${AHX.state.user?.email || 'Not available'}</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
            <div>
              <div style="font-weight: 600;">Name</div>
              <div style="color: var(--gray-500); font-size: 0.9rem;">${AHX.state.user?.name || 'Not available'}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h2 style="margin-bottom: 1rem; color: var(--gray-900);">Storage</h2>
        <div style="display: grid; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
            <div>
              <div style="font-weight: 600;">Total Files</div>
              <div style="color: var(--gray-500); font-size: 0.9rem;">Documents stored locally</div>
            </div>
            <div style="font-weight: 600;">${stats.total}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
            <div>
              <div style="font-weight: 600;">Storage Used</div>
              <div style="color: var(--gray-500); font-size: 0.9rem;">Space occupied by files</div>
            </div>
            <div style="font-weight: 600;">${AHX.util.bytes(stats.totalSize)}</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h2 style="margin-bottom: 1rem; color: var(--gray-900);">Preferences</h2>
        <div style="display: grid; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--gray-200);">
            <div>
              <div style="font-weight: 600;">Theme</div>
              <div style="color: var(--gray-500); font-size: 0.9rem;">App appearance</div>
            </div>
            <button class="btn" onclick="toggleTheme()">${AHX.state.theme === 'dark' ? 'Dark' : 'Light'}</button>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h2 style="margin-bottom: 1rem; color: var(--gray-900);">Actions</h2>
        <div style="display: grid; gap: 1rem;">
          <button class="btn" onclick="exportData()" style="justify-self: start;">Export All Data</button>
          <button class="btn" onclick="clearAllData()" style="background: var(--danger); color: white; border: none; justify-self: start;">Clear All Local Data</button>
          <button class="btn" onclick="AHX.auth.signOut()" style="background: var(--danger); color: white; border: none; justify-self: start;">Sign Out</button>
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
    
  } catch (error) {
    console.error('Failed to open file:', error);
    AHX.ui.showNotification(error.message || 'Failed to open file', 'error');
  }
};

AHX.view.performSearch = AHX.util.debounce(async () => {
  const query = document.getElementById('searchInput')?.value?.trim();
  const resultsContainer = document.getElementById('searchResults');
  
  if (!query || !resultsContainer) return;
  
  try {
    resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
    
    const results = await AHX.files.search(query);
    
    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>No files found for "${query}"</p>
        </div>
      `;
      return;
    }
    
    resultsContainer.innerHTML = `
      <div style="display: grid; gap: 1rem;">
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
    
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML = '<div class="error-state"><p>Search failed. Please try again.</p></div>';
  }
}, 300);

// =================== HELPER FUNCTIONS ===================
function updateUserDisplay() {
  const userNameElement = document.getElementById('sidebarUserName');
  if (userNameElement && AHX.state.user) {
    userNameElement.textContent = AHX.state.user.name;
  }
}

function updateNavigation(currentRoute) {
  document.querySelectorAll('.nav-item').forEach(item => {
    const route = item.getAttribute('data-route');
    if (route === currentRoute) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function setupEventListeners() {
  // FAB button
  const fab = document.getElementById('fab');
  if (fab) {
    fab.addEventListener('click', () => AHX.ui.openUpload());
  }
  
  // Upload subject dropdown
  const uploadSubject = document.getElementById('uploadSubject');
  if (uploadSubject) {
    AHX.state.subjects.forEach(subject => {
      const option = document.createElement('option');
      option.value = subject.key;
      option.textContent = `${subject.name} (${subject.code})`;
      uploadSubject.appendChild(option);
    });
  }
}

function setupRouting() {
  window.addEventListener('hashchange', AHX.view.render);
  if (!location.hash) location.hash = '#/dashboard';
}

async function loadSubjects() {
  try {
    const response = await fetch('subjects.json');
    if (response.ok) {
      const subjects = await response.json();
      AHX.state.subjects = [...subjects, ...AHX.state.subjects.filter(s => s.key === 'scanned')];
    }
  } catch (error) {
    console.warn('Failed to load subjects.json:', error);
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('uploadFiles');
  
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--gray-300)';
      dropZone.style.backgroundColor = 'transparent';
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--gray-300)';
      dropZone.style.backgroundColor = 'transparent';
      fileInput.files = e.dataTransfer.files;
    });
  }
}

function setupNetworkMonitoring() {
  window.addEventListener('online', () => {
    AHX.state.isOnline = true;
    AHX.ui.showNotification('Connection restored', 'success', 3000);
  });
  
  window.addEventListener('offline', () => {
    AHX.state.isOnline = false;
    AHX.ui.showNotification('You are offline', 'warning', 5000);
  });
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  
  if (isDark) {
    root.classList.remove('dark');
    AHX.state.theme = 'light';
  } else {
    root.classList.add('dark');
    AHX.state.theme = 'dark';
  }
  
  localStorage.setItem('ahx_theme', AHX.state.theme);
}

async function exportData() {
  try {
    const files = await AHX.files.all();
    const data = {
      version: APP_CONFIG.version,
      exportDate: new Date().toISOString(),
      user: AHX.state.user,
      subjects: AHX.state.subjects,
      files: files.map(f => ({
        ...f,
        blob: undefined // Don't export blobs
      }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `academic-hub-x-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    AHX.ui.showNotification('Data exported successfully', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    AHX.ui.showNotification('Export failed', 'error');
  }
}

// =================== FIXED CLEAR ALL DATA FUNCTION ===================
async function clearAllData() {
  if (!confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
    return;
  }
  
  try {
    if (!AHX.state.db) {
      throw new Error('Database not available');
    }
    
    const tx = AHX.state.db.transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    
    // Use the clear() method to remove all records
    const clearRequest = store.clear();
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = async () => {
        try {
          AHX.ui.showNotification('All data cleared successfully', 'success');
          await AHX.view.render();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      tx.onerror = () => {
        reject(new Error(`Transaction failed: ${tx.error?.message || 'Unknown error'}`));
      };
      
      clearRequest.onerror = () => {
        reject(new Error(`Clear operation failed: ${clearRequest.error?.message || 'Unknown error'}`));
      };
    });
    
  } catch (error) {
    console.error('Clear all data failed:', error);
    AHX.ui.showNotification('Failed to clear data: ' + error.message, 'error');
    throw error;
  }
}

// Export for debugging and global access
window.AHX = AHX;

// Make functions globally available for onclick handlers
window.toggleTheme = toggleTheme;
window.exportData = exportData;
window.clearAllData = clearAllData;

console.log('Academic Hub X app.js loaded successfully');
