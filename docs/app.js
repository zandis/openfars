/* ========================================
   OpenFARS — Biomedical Research Platform
   Frontend Application

   Sections:
   1. API       — Backend HTTP client
   2. Auth      — Login / register / session
   3. UI        — View switching, sidebar, toasts, modals
   4. App       — Dashboard, research pipeline, settings
   5. RConsole  — R code execution
   6. BioSearch — Biomedical database search
   7. DataMgr   — File upload / management
   8. AIModels  — API key management
   9. Packages  — R/Python package management
   10. Boot     — Initialization
   ======================================== */

const BASE = window.location.origin;

// ============================================================
// 1. API — Fetch wrapper with auth token
// ============================================================
const API = {
  token: localStorage.getItem('openfars_token') || '',

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('openfars_token', t);
    else localStorage.removeItem('openfars_token');
  },

  async request(method, path, body, isFormData) {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const resp = await fetch(`${BASE}${path}`, opts);
    if (resp.status === 401) {
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || data.message || `Error ${resp.status}`);
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  del(path) { return this.request('DELETE', path); },
  upload(path, formData) { return this.request('POST', path, formData, true); },
};

// ============================================================
// 2. Auth — Login, register, session management
// ============================================================
const Auth = {
  isRegister: false,

  toggleMode() {
    this.isRegister = !this.isRegister;
    const btn = document.getElementById('login-btn');
    const toggle = document.getElementById('login-toggle-text');
    btn.textContent = this.isRegister ? 'Create Account' : 'Sign In';
    toggle.textContent = this.isRegister ? 'Already have an account? Sign in' : 'Create an account';
    document.getElementById('login-error').textContent = '';
  },

  async handleSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';

    if (!username || !password) { errEl.textContent = 'Please fill in all fields'; return; }

    try {
      const endpoint = this.isRegister ? '/api/auth/register' : '/api/auth/login';
      const data = await API.request('POST', endpoint, { username, password });
      API.setToken(data.token);
      this.onLogin(data.user);
    } catch (err) {
      errEl.textContent = err.message;
    }
  },

  onLogin(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-display-name').textContent = user.username;
    document.getElementById('user-avatar').textContent = user.username[0].toUpperCase();
    App.init();
  },

  logout() {
    API.setToken('');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
  },

  async checkSession() {
    if (!API.token) return;
    try {
      const user = await API.get('/api/auth/me');
      this.onLogin(user);
    } catch {
      API.setToken('');
    }
  },
};

// ============================================================
// 3. UI — View switching, sidebar, toasts, modals
// ============================================================
const UI = {
  currentView: 'dashboard',

  go(viewName) {
    this.currentView = viewName;
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewName);
    });
    // Trigger view load
    this.onViewEnter(viewName);
  },

  onViewEnter(view) {
    switch (view) {
      case 'dashboard': App.loadDashboard(); break;
      case 'projects': App.loadProjects(); break;
      case 'ai-models': AIModels.load(); break;
      case 'data-manager': DataMgr.refresh(); break;
      case 'packages': Packages.load(); break;
      case 'settings': App.loadSettings(); break;
      case 'r-console': RConsole.init(); break;
    }
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  },

  openModal(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  },

  renderMarkdown(md) {
    if (!md) return '';
    let h = this.escapeHtml(md);
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`]+)`/g, '<code style="background:var(--bg-code);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
    h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    h = h.replace(/<\/ul>\s*<ul>/g, '');
    h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^(?!<[hluop])(.*\S.*)$/gm, '<p>$1</p>');
    h = h.replace(/\n{2,}/g, '\n');
    return h;
  },

  formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  badgeClass(status) {
    const map = { completed: 'badge-completed', running: 'badge-running', error: 'badge-error',
                  ideation: 'badge-running', planning: 'badge-running', experiment: 'badge-running',
                  writing: 'badge-running', pending: 'badge-pending' };
    return map[status] || 'badge-pending';
  },
};

// ============================================================
// 4. App — Dashboard, pipeline, settings
// ============================================================
const App = {
  _currentProject: null,
  _paper: '',

  init() {
    // Set up sidebar navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', () => UI.go(el.dataset.view));
    });
    UI.go('dashboard');
  },

  // ---- Dashboard ----
  async loadDashboard() {
    try {
      const projects = await API.get('/api/projects');
      const completed = projects.filter(p => p.status === 'completed').length;
      document.getElementById('stat-projects').textContent = projects.length;
      document.getElementById('stat-completed').textContent = completed;
      document.getElementById('stat-papers').textContent = completed;

      // R status
      try {
        const rs = await API.get('/api/r/status');
        document.getElementById('stat-r-status').textContent = rs.available ? 'Ready' : 'N/A';
        document.getElementById('stat-r-status').style.color = rs.available ? 'var(--success)' : 'var(--text-muted)';
      } catch { document.getElementById('stat-r-status').textContent = '--'; }

      // Recent projects (last 6)
      const recent = projects.slice(0, 6);
      const container = document.getElementById('recent-projects');
      if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No projects yet. Start your first research!</p></div>';
        return;
      }
      container.innerHTML = recent.map(p => this._projectCardHtml(p)).join('');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  _projectCardHtml(p) {
    const topics = (p.topics || []).map(t => `<span class="topic-tag">${UI.escapeHtml(t)}</span>`).join('');
    return `
      <div class="project-card" onclick="App.openProject('${p.id}')">
        <h3>${UI.escapeHtml(p.title || p.id)}</h3>
        <div class="meta">${UI.formatDate(p.created_at)} &middot; <span class="badge ${UI.badgeClass(p.status)}">${p.status}</span></div>
        <div class="topics-row">${topics}</div>
      </div>`;
  },

  // ---- Projects list ----
  async loadProjects() {
    try {
      const projects = await API.get('/api/projects');
      const container = document.getElementById('all-projects');
      if (projects.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No projects yet</p></div>';
        return;
      }
      container.innerHTML = projects.map(p => this._projectCardHtml(p)).join('');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  // ---- Open project detail ----
  async openProject(id) {
    try {
      const p = await API.get(`/api/projects/${id}`);
      this._currentProject = p;
      this._paper = p.paper || '';
      document.getElementById('detail-title').textContent = p.title || p.id;

      let html = `
        <div class="detail-card">
          <div class="detail-card-body" style="border-bottom:none">
            <p><strong>ID:</strong> ${UI.escapeHtml(p.id)}</p>
            <p><strong>Provider:</strong> ${UI.escapeHtml(p.provider)} &middot; <strong>Model:</strong> ${UI.escapeHtml(p.model)}</p>
            <p><strong>Topics:</strong> ${(p.topics||[]).map(t=>`<span class="topic-tag">${UI.escapeHtml(t)}</span>`).join(' ')}</p>
            <p><strong>Status:</strong> <span class="badge ${UI.badgeClass(p.status)}">${p.status}</span></p>
            <p><strong>Created:</strong> ${UI.formatDate(p.created_at)}</p>
            ${p.error ? `<p style="color:var(--error)"><strong>Error:</strong> ${UI.escapeHtml(p.error)}</p>` : ''}
          </div>
        </div>`;

      if (p.idea) {
        html += `<div class="detail-card"><div class="detail-card-header" onclick="this.nextElementSibling.classList.toggle('hidden')">1. Ideation <span>&#9660;</span></div><div class="detail-card-body"><pre>${UI.escapeHtml(JSON.stringify(p.idea, null, 2))}</pre></div></div>`;
      }
      if (p.plan) {
        html += `<div class="detail-card"><div class="detail-card-header" onclick="this.nextElementSibling.classList.toggle('hidden')">2. Plan <span>&#9660;</span></div><div class="detail-card-body"><pre>${UI.escapeHtml(JSON.stringify(p.plan, null, 2))}</pre></div></div>`;
      }
      if (p.results) {
        html += `<div class="detail-card"><div class="detail-card-header" onclick="this.nextElementSibling.classList.toggle('hidden')">3. Results <span>&#9660;</span></div><div class="detail-card-body"><pre>${UI.escapeHtml(JSON.stringify(p.results, null, 2))}</pre></div></div>`;
      }
      if (p.paper) {
        html += `<div class="detail-card"><div class="detail-card-header">4. Paper</div><div class="detail-card-body"><div class="btn-group" style="margin-bottom:12px"><button class="btn btn-sm" onclick="App.downloadPaper('md')">Download .md</button><button class="btn btn-sm" onclick="App.downloadPaper('txt')">Download .txt</button><button class="btn btn-sm" onclick="App.copyPaper()">Copy</button></div><div class="paper-render">${UI.renderMarkdown(p.paper)}</div></div></div>`;
      }

      document.getElementById('detail-content').innerHTML = html;
      UI.go('project-detail');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  rerunProject() {
    if (!this._currentProject) return;
    const p = this._currentProject;
    document.getElementById('input-topics').value = (p.topics || []).join(', ');
    if (p.model) document.getElementById('input-model').value = p.model;
    if (p.provider) document.getElementById('input-provider').value = p.provider;
    UI.go('new-research');
  },

  async deleteCurrentProject() {
    if (!this._currentProject) return;
    if (!confirm(`Delete "${this._currentProject.title}"?`)) return;
    try {
      await API.del(`/api/projects/${this._currentProject.id}`);
      UI.toast('Project deleted', 'success');
      UI.go('projects');
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  // ---- Run research pipeline ----
  async startResearch() {
    const topicsRaw = document.getElementById('input-topics').value.trim();
    if (!topicsRaw) { UI.toast('Enter at least one research topic', 'error'); return; }

    const topics = topicsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const provider = document.getElementById('input-provider').value;
    const model = document.getElementById('input-model').value;
    const projectId = document.getElementById('input-project-id').value.trim();

    const btn = document.getElementById('btn-start-research');
    btn.disabled = true;
    btn.textContent = 'Running pipeline...';

    // Show pipeline
    document.getElementById('pipeline-section').classList.remove('hidden');
    document.getElementById('paper-output').classList.add('hidden');
    ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
      const el = document.getElementById(`step-${s}`);
      el.className = 'pipeline-step';
      const out = document.getElementById(`out-${s}`);
      out.textContent = '';
      out.classList.remove('visible');
    });

    // Run via API
    try {
      // Set stages to active progressively using fetch streaming isn't possible,
      // so we'll show ideation as active and wait for the full result
      document.getElementById('step-ideation').classList.add('active');

      const result = await API.post('/api/projects/run', {
        topics,
        provider,
        model,
        project_id: projectId || undefined,
        custom_prompts: this._getCustomPrompts(),
      });

      // Mark all completed and show outputs
      const stages = ['ideation', 'planning', 'experiment', 'writing'];
      const dataKeys = ['idea', 'plan', 'results', 'paper'];
      stages.forEach((s, i) => {
        const el = document.getElementById(`step-${s}`);
        el.className = 'pipeline-step completed';
        const out = document.getElementById(`out-${s}`);
        const val = result[dataKeys[i]];
        if (typeof val === 'object') {
          out.textContent = JSON.stringify(val, null, 2);
        } else {
          out.textContent = val || 'Done';
        }
        out.classList.add('visible');
      });

      // Show paper
      if (result.paper) {
        this._paper = result.paper;
        this._currentProject = { id: result.id, paper: result.paper };
        document.getElementById('paper-render').innerHTML = UI.renderMarkdown(result.paper);
        document.getElementById('paper-output').classList.remove('hidden');
      }

      UI.toast('Research completed!', 'success');

    } catch (err) {
      // Mark current active as error
      ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
        const el = document.getElementById(`step-${s}`);
        if (el.classList.contains('active')) {
          el.className = 'pipeline-step error';
          document.getElementById(`out-${s}`).textContent = err.message;
          document.getElementById(`out-${s}`).classList.add('visible');
        }
      });
      UI.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start Automated Research';
    }
  },

  _getCustomPrompts() {
    const prompts = {};
    ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
      const el = document.getElementById(`prompt-${s}`);
      if (el && el.value.trim()) prompts[s] = el.value.trim();
    });
    return prompts;
  },

  // ---- Paper download ----
  downloadPaper(ext) {
    if (!this._paper) { UI.toast('No paper available', 'error'); return; }
    const blob = new Blob([this._paper], { type: ext === 'md' ? 'text/markdown' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paper.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  copyPaper() {
    if (!this._paper) return;
    navigator.clipboard.writeText(this._paper).then(() => UI.toast('Copied to clipboard', 'success'));
  },

  // ---- Settings ----
  async loadSettings() {
    try {
      const settings = await API.get('/api/settings');
      // Load agent prompts from localStorage (client-side)
      ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
        const el = document.getElementById(`prompt-${s}`);
        if (el) el.value = localStorage.getItem(`openfars_prompt_${s}`) || el.value;
      });
      // Drive status
      const drive = await API.get('/api/drive/status');
      document.getElementById('drive-status').textContent = drive.connected
        ? 'Connected to Google Drive'
        : 'Not connected. Configure OAuth credentials to enable.';
    } catch (err) {
      // Non-critical, settings still usable
    }
  },

  savePrompts() {
    ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
      const el = document.getElementById(`prompt-${s}`);
      if (el) localStorage.setItem(`openfars_prompt_${s}`, el.value);
    });
    UI.toast('Prompts saved', 'success');
  },

  async changePassword() {
    const current = document.getElementById('set-current-pw').value;
    const newPw = document.getElementById('set-new-pw').value;
    if (!current || !newPw) { UI.toast('Fill in both fields', 'error'); return; }
    try {
      await API.post('/api/auth/change-password', { current_password: current, new_password: newPw });
      UI.toast('Password changed', 'success');
      document.getElementById('set-current-pw').value = '';
      document.getElementById('set-new-pw').value = '';
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async saveNCBIKey() {
    const key = document.getElementById('set-ncbi-key').value.trim();
    try {
      await API.post('/api/settings', { key: 'ncbi_api_key', value: key });
      UI.toast('NCBI key saved', 'success');
    } catch (err) { UI.toast(err.message, 'error'); }
  },
};

// ============================================================
// 5. R Console
// ============================================================
const RConsole = {
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    // Setup Ctrl+Enter to run
    const editor = document.getElementById('r-code-input');
    if (editor) {
      editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.execute();
        }
        // Tab key inserts spaces
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = editor.selectionStart;
          editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(editor.selectionEnd);
          editor.selectionStart = editor.selectionEnd = start + 2;
        }
      });
    }
  },

  async execute() {
    const code = document.getElementById('r-code-input').value.trim();
    if (!code) return;

    const btn = document.getElementById('btn-run-r');
    btn.disabled = true;
    btn.textContent = 'Running...';
    document.getElementById('r-output').innerHTML = '<div class="empty-state-sm">Executing R code...</div>';
    document.getElementById('r-plots').innerHTML = '';

    try {
      const result = await API.post('/api/r/execute', { code, timeout: 60 });

      // Output
      const outputEl = document.getElementById('r-output');
      let outputHtml = '';
      if (result.output) outputHtml += result.output;
      if (result.error) outputHtml += `\n<span style="color:#ef4444">${UI.escapeHtml(result.error)}</span>`;
      if (!outputHtml.trim()) outputHtml = '<span style="color:#6b7280">No output</span>';
      outputEl.innerHTML = outputHtml;

      // Plots
      const plotsEl = document.getElementById('r-plots');
      if (result.plots && result.plots.length > 0) {
        plotsEl.innerHTML = result.plots.map(src => `<img src="${src}" alt="R Plot">`).join('');
      }

      if (result.success) UI.toast('Code executed successfully', 'success');
      else UI.toast('Execution completed with errors', 'error');
    } catch (err) {
      document.getElementById('r-output').innerHTML = `<span style="color:#ef4444">${UI.escapeHtml(err.message)}</span>`;
      UI.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run Code';
    }
  },

  clearOutput() {
    document.getElementById('r-output').innerHTML = '<div class="empty-state-sm">Run some R code to see output here</div>';
    document.getElementById('r-plots').innerHTML = '';
  },

  async loadHistory() {
    try {
      const history = await API.get('/api/r/history');
      let html = history.map(h => `
        <div style="margin-bottom:12px;padding:12px;background:var(--bg-code);border-radius:var(--radius);cursor:pointer" onclick="document.getElementById('r-code-input').value=this.dataset.code" data-code="${UI.escapeHtml(h.code)}">
          <div style="font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;max-height:60px;overflow:hidden">${UI.escapeHtml(h.code)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${UI.formatDate(h.created_at)}</div>
        </div>`).join('');
      if (!html) html = '<p class="text-muted">No history yet</p>';
      UI.openModal('R Execution History', html);
    } catch (err) { UI.toast(err.message, 'error'); }
  },
};

// ============================================================
// 6. BioSearch — Biomedical database queries
// ============================================================
const BioSearch = {
  async search() {
    const query = document.getElementById('bio-query').value.trim();
    if (!query) { UI.toast('Enter a search query', 'error'); return; }

    const db = document.getElementById('bio-database').value;
    const btn = document.getElementById('btn-bio-search');
    btn.disabled = true;
    btn.textContent = 'Searching...';

    try {
      const data = await API.get(`/api/bio/${db}?query=${encodeURIComponent(query)}&max_results=20`);
      this.renderResults(db, data);
    } catch (err) {
      document.getElementById('bio-results').innerHTML = `<p style="color:var(--error)">${UI.escapeHtml(err.message)}</p>`;
      UI.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Search';
    }
  },

  renderResults(db, data) {
    const container = document.getElementById('bio-results');
    let html = `<div class="bio-count">${data.count?.toLocaleString() || 0} results found</div>`;

    if (db === 'pubmed' || db === 'europepmc') {
      const articles = data.articles || [];
      html += articles.map(a => `
        <div class="bio-result-card">
          <h3><a href="${a.url}" target="_blank" rel="noopener">${UI.escapeHtml(a.title)}</a></h3>
          <div class="bio-meta">${UI.escapeHtml(Array.isArray(a.authors) ? a.authors.join(', ') : (a.authors || ''))} &middot; ${UI.escapeHtml(a.journal || '')} &middot; ${UI.escapeHtml(a.pubdate || '')}</div>
          ${a.doi ? `<div class="bio-detail">DOI: ${UI.escapeHtml(a.doi)}</div>` : ''}
          ${a.cited_by_count ? `<div class="bio-detail">Cited by: ${a.cited_by_count}</div>` : ''}
        </div>`).join('');
    } else if (db === 'uniprot') {
      const proteins = data.proteins || [];
      html += proteins.map(p => `
        <div class="bio-result-card">
          <h3><a href="${p.url}" target="_blank" rel="noopener">${UI.escapeHtml(p.accession)} — ${UI.escapeHtml(p.protein_name)}</a></h3>
          <div class="bio-meta">${UI.escapeHtml(p.organism)} &middot; ${p.length} aa</div>
          ${p.gene_names?.length ? `<div class="bio-detail">Genes: ${p.gene_names.map(g => UI.escapeHtml(g)).join(', ')}</div>` : ''}
        </div>`).join('');
    } else if (db === 'clinicaltrials') {
      const trials = data.trials || [];
      html += trials.map(t => `
        <div class="bio-result-card">
          <h3><a href="${t.url}" target="_blank" rel="noopener">${UI.escapeHtml(t.nct_id)} — ${UI.escapeHtml(t.title)}</a></h3>
          <div class="bio-meta">Status: ${UI.escapeHtml(t.status)} &middot; Phase: ${UI.escapeHtml(t.phase || 'N/A')} &middot; Start: ${UI.escapeHtml(t.start_date || 'N/A')}</div>
        </div>`).join('');
    } else if (db === 'gene') {
      const genes = data.genes || [];
      html += genes.map(g => `
        <div class="bio-result-card">
          <h3><a href="${g.url}" target="_blank" rel="noopener">${UI.escapeHtml(g.name)}</a> (Gene ID: ${UI.escapeHtml(g.gene_id)})</h3>
          <div class="bio-meta">${UI.escapeHtml(g.organism)} &middot; Chr ${UI.escapeHtml(g.chromosome || 'N/A')}</div>
          <div class="bio-detail">${UI.escapeHtml(g.description)}</div>
        </div>`).join('');
    }

    if (!html.includes('bio-result-card')) html += '<p class="text-muted">No results found</p>';
    container.innerHTML = html;
  },
};

// ============================================================
// 7. DataMgr — File upload and management
// ============================================================
const DataMgr = {
  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    for (const file of files) this.uploadFile(file);
  },

  handleFileSelect(e) {
    const files = e.target.files;
    for (const file of files) this.uploadFile(file);
    e.target.value = '';
  },

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await API.upload('/api/files/upload', formData);
      UI.toast(`Uploaded: ${file.name}`, 'success');
      this.refresh();
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async refresh() {
    try {
      const files = await API.get('/api/files');
      const container = document.getElementById('files-list');
      if (files.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding:20px">No files uploaded yet</p>';
        return;
      }
      container.innerHTML = `
        <table class="files-table">
          <thead><tr><th>Name</th><th>Size</th><th>Type</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${files.map(f => `
              <tr>
                <td><strong>${UI.escapeHtml(f.filename)}</strong></td>
                <td>${UI.formatSize(f.size)}</td>
                <td>${UI.escapeHtml(f.mime_type || 'unknown')}</td>
                <td>${UI.formatDate(f.created_at)}</td>
                <td>
                  <a class="btn btn-sm" href="${BASE}/api/files/${f.id}/download" target="_blank">Download</a>
                  <button class="btn btn-sm btn-danger" onclick="DataMgr.deleteFile(${f.id})">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async deleteFile(id) {
    if (!confirm('Delete this file?')) return;
    try {
      await API.del(`/api/files/${id}`);
      UI.toast('File deleted', 'success');
      this.refresh();
    } catch (err) { UI.toast(err.message, 'error'); }
  },
};

// ============================================================
// 8. AIModels — API key management
// ============================================================
const AIModels = {
  async load() {
    try {
      const keys = await API.get('/api/ai/keys');
      const container = document.getElementById('api-keys-list');
      if (keys.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding:16px">No API keys configured. Add one above to start running research.</p>';
        return;
      }
      container.innerHTML = keys.map(k => `
        <div class="key-card">
          <div class="key-info">
            <div class="key-provider">${UI.escapeHtml(k.provider)}${k.label ? ` — ${UI.escapeHtml(k.label)}` : ''}</div>
            <div class="key-detail">${UI.escapeHtml(k.key_preview)} &middot; Added ${UI.formatDate(k.created_at)}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="AIModels.removeKey(${k.id})">Remove</button>
        </div>`).join('');
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async addKey() {
    const provider = document.getElementById('key-provider').value;
    const api_key = document.getElementById('key-value').value.trim();
    const label = document.getElementById('key-label').value.trim();
    const api_base = document.getElementById('key-base').value.trim();

    if (!api_key) { UI.toast('Enter an API key', 'error'); return; }

    try {
      await API.post('/api/ai/keys', { provider, api_key, label, api_base });
      document.getElementById('key-value').value = '';
      document.getElementById('key-label').value = '';
      document.getElementById('key-base').value = '';
      UI.toast('API key added', 'success');
      this.load();
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async testKey() {
    const provider = document.getElementById('key-provider').value;
    const api_key = document.getElementById('key-value').value.trim();
    const api_base = document.getElementById('key-base').value.trim();

    if (!api_key) { UI.toast('Enter an API key to test', 'error'); return; }

    const resultEl = document.getElementById('key-test-result');
    resultEl.textContent = 'Testing connection...';
    resultEl.style.color = 'var(--text-muted)';

    try {
      const result = await API.post('/api/ai/test', { provider, api_key, api_base });
      if (result.ok) {
        resultEl.textContent = 'Connection successful!';
        resultEl.style.color = 'var(--success)';
      } else {
        resultEl.textContent = `Failed: ${result.error}`;
        resultEl.style.color = 'var(--error)';
      }
    } catch (err) {
      resultEl.textContent = `Error: ${err.message}`;
      resultEl.style.color = 'var(--error)';
    }
  },

  async removeKey(id) {
    if (!confirm('Remove this API key?')) return;
    try {
      await API.del(`/api/ai/keys/${id}`);
      UI.toast('Key removed', 'success');
      this.load();
    } catch (err) { UI.toast(err.message, 'error'); }
  },
};

// ============================================================
// 9. Packages — R/Python package management
// ============================================================
const Packages = {
  async load() {
    try {
      const pkgs = await API.get('/api/packages');
      const container = document.getElementById('packages-list');
      if (pkgs.length === 0) {
        container.innerHTML = '<p class="text-muted">No packages tracked. Install packages above.</p>';
        return;
      }
      container.innerHTML = pkgs.map(p => `
        <div class="pkg-card">
          <div class="pkg-name">${UI.escapeHtml(p.name)}</div>
          <div class="pkg-type">${p.type === 'r' ? 'R' : 'Python'}${p.version ? ` v${UI.escapeHtml(p.version)}` : ''}</div>
        </div>`).join('');
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  async install() {
    const name = document.getElementById('pkg-name').value.trim();
    const type = document.getElementById('pkg-type').value;
    if (!name) { UI.toast('Enter a package name', 'error'); return; }

    const btn = document.getElementById('btn-install-pkg');
    const status = document.getElementById('pkg-status');
    btn.disabled = true;
    btn.textContent = 'Installing...';
    status.textContent = `Installing ${name}...`;
    status.style.color = 'var(--text-muted)';

    try {
      const result = await API.post('/api/packages/install', { name, pkg_type: type });
      if (result.success) {
        status.textContent = `${name} installed successfully!`;
        status.style.color = 'var(--success)';
        UI.toast(`${name} installed`, 'success');
        document.getElementById('pkg-name').value = '';
        this.load();
      } else {
        status.textContent = `Failed: ${result.error}`;
        status.style.color = 'var(--error)';
      }
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      status.style.color = 'var(--error)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Install';
    }
  },
};

// ============================================================
// 10. Boot
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  Auth.checkSession();
});
