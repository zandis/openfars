/* ========================================
   OpenFARS — Frontend Application
   All agent logic, workspace, and UI in one file
   for easy modification.
   ======================================== */

// ============================================================
// STORAGE — localStorage-based workspace (replaces Python Workspace)
// ============================================================
const Storage = {
  _prefix: 'openfars_',

  get(key) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, value) {
    localStorage.setItem(this._prefix + key, JSON.stringify(value));
  },

  remove(key) {
    localStorage.removeItem(this._prefix + key);
  },

  // Project-specific helpers
  getProjects() {
    return this.get('projects') || [];
  },

  saveProject(project) {
    const projects = this.getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) projects[idx] = project;
    else projects.unshift(project);
    this.set('projects', projects);
  },

  getProject(id) {
    return this.getProjects().find(p => p.id === id) || null;
  },

  deleteProject(id) {
    const projects = this.getProjects().filter(p => p.id !== id);
    this.set('projects', projects);
  },

  getSettings() {
    return this.get('settings') || {};
  },

  saveSettings(settings) {
    this.set('settings', settings);
  },

  exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this._prefix)) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  },

  importAll(data) {
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(this._prefix)) {
        localStorage.setItem(key, value);
      }
    }
  },

  clearAll() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this._prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
};


// ============================================================
// AGENTS — Ported from Python (same prompts, same logic)
// ============================================================
const Agents = {

  // Get settings for API calls
  _getConfig() {
    const settings = Storage.getSettings();
    return {
      apiKey: settings.apiKey || '',
      apiBase: settings.apiBase || 'https://api.openai.com/v1',
      model: document.getElementById('input-model')?.value || settings.model || 'gpt-4o',
      prompts: {
        ideation: settings.promptIdeation || 'You are an expert AI researcher responsible for generating novel research ideas.',
        planning: settings.promptPlanning || 'You are a senior research engineer responsible for planning experiments.',
        experiment: settings.promptExperiment || 'You are a research engineer who generates detailed experiment code and simulated results based on the experiment plan.',
        writing: settings.promptWriting || 'You are an academic writer. Write a clear and concise research paper.',
      }
    };
  },

  // Core LLM call (mirrors BaseAgent.call_llm)
  async callLLM(prompt, systemPrompt) {
    const config = this._getConfig();

    if (!config.apiKey) {
      throw new Error('No API key set. Go to Settings to add your OpenAI API key.');
    }

    const url = `${config.apiBase}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  },

  // ---- Stage 1: Ideation (mirrors IdeationAgent.execute) ----
  async ideation(topics) {
    const config = this._getConfig();
    const prompt = `Based on the following research topics: ${topics.join(', ')}
Generate a novel research hypothesis for an AI paper.
Provide the output in JSON format with the following fields:
- title: Title of the proposed paper
- hypothesis: The core hypothesis
- motivation: Why this is important
- methodology_sketch: Brief idea of how to test it`;

    const response = await this.callLLM(prompt, config.prompts.ideation);

    try {
      const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return {
        title: `Automated Research on ${topics[0]}`,
        hypothesis: 'AI agents can autonomously conduct research.',
        motivation: 'To scale science.',
        methodology_sketch: 'Build a multi-agent system.',
        _raw: response,
      };
    }
  },

  // ---- Stage 2: Planning (mirrors PlanningAgent.execute) ----
  async planning(idea) {
    const config = this._getConfig();
    const prompt = `Given the following research idea:
Title: ${idea.title}
Hypothesis: ${idea.hypothesis}
Methodology: ${idea.methodology_sketch}

Create a detailed experiment plan.
Provide the output in JSON format with:
- steps: List of steps to execute
- requirements: List of required libraries/resources
- metrics: Metrics to evaluate success`;

    const response = await this.callLLM(prompt, config.prompts.planning);

    try {
      const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return {
        steps: ['Setup environment', 'Run baseline', 'Run proposed method', 'Compare results'],
        requirements: ['python', 'pytorch'],
        metrics: ['accuracy', 'latency'],
        _raw: response,
      };
    }
  },

  // ---- Stage 3: Experiment (mirrors ExperimentAgent.execute) ----
  async experiment(plan) {
    const config = this._getConfig();

    // Generate experiment code via LLM (enhanced from original mock)
    const prompt = `Given this experiment plan:
Steps: ${JSON.stringify(plan.steps)}
Requirements: ${JSON.stringify(plan.requirements)}
Metrics: ${JSON.stringify(plan.metrics)}

For each step, generate a brief Python code snippet that would implement it.
Then provide simulated but realistic results.

Return JSON with:
- code: object mapping step name to Python code string
- results: object with metric names as keys and realistic numeric values
- success: boolean`;

    let expResult;
    try {
      const response = await this.callLLM(prompt, config.prompts.experiment);
      const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
      expResult = JSON.parse(clean);
    } catch {
      // Fallback: simulated results (same as Python version)
      const code = {};
      for (const step of (plan.steps || [])) {
        const safeName = step.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20);
        code[safeName] = `# Implementation for ${step}\nprint('Running ${step}')`;
      }
      expResult = {
        code,
        results: {
          accuracy: +(0.85 + Math.random() * 0.1).toFixed(4),
          latency_ms: +(100 + Math.random() * 50).toFixed(1),
        },
        success: true,
      };
    }

    return expResult;
  },

  // ---- Stage 4: Writing (mirrors WritingAgent.execute) ----
  async writing(idea, plan, results) {
    const config = this._getConfig();
    const prompt = `Write a short research paper based on the following:

Title: ${idea.title}
Hypothesis: ${idea.hypothesis}

Experiment Plan:
${JSON.stringify(plan, null, 2)}

Results:
${JSON.stringify(results, null, 2)}

The paper should include: Abstract, Introduction, Methods, Results, Discussion.
Format the paper in Markdown.`;

    const paper = await this.callLLM(prompt, config.prompts.writing);

    if (!paper || paper.includes('[Mock LLM Response]')) {
      return `# ${idea.title}\n\n## Abstract\nThis is a generated paper about ${idea.hypothesis}.\n\n## Results\nWe achieved accuracy of ${results?.results?.accuracy || 'N/A'}.`;
    }

    return paper;
  },
};


// ============================================================
// UI — View switching, rendering, and interactions
// ============================================================
const UI = {
  currentView: 'dashboard',
  currentProjectId: null,

  init() {
    // Set up nav buttons
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // Load settings into form
    this.loadSettingsForm();

    // Render dashboard
    this.renderDashboard();

    // Default view
    this.switchView('dashboard');
  },

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    if (viewName === 'dashboard') this.renderDashboard();
  },

  // ---- Dashboard ----
  renderDashboard() {
    const projects = Storage.getProjects();
    const container = document.getElementById('projects-list');

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <p>No research projects yet</p>
          <p class="text-muted">Start your first automated research project</p>
        </div>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="project-card" onclick="App.openProject('${p.id}')">
        <h3>${this.escapeHtml(p.title || p.id)}</h3>
        <div class="meta">
          ${new Date(p.createdAt).toLocaleDateString()} &middot;
          <span class="status-badge ${p.status}">${p.status}</span>
        </div>
        <div class="topics">
          ${(p.topics || []).map(t => `<span class="topic-tag">${this.escapeHtml(t)}</span>`).join('')}
        </div>
      </div>`).join('');
  },

  // ---- Pipeline Stage Updates ----
  setStageStatus(stage, status) {
    const el = document.getElementById(`stage-${stage}`);
    if (!el) return;
    el.classList.remove('active', 'completed', 'error');
    if (status) el.classList.add(status);
  },

  setStageOutput(stage, content) {
    const el = document.getElementById(`output-${stage}`);
    if (!el) return;
    if (typeof content === 'object') {
      el.innerHTML = `<pre>${this.escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
    } else {
      el.innerHTML = `<pre>${this.escapeHtml(content)}</pre>`;
    }
  },

  toggleStageOutput(stage) {
    const el = document.getElementById(`output-${stage}`);
    if (el) el.classList.toggle('open');
  },

  resetPipeline() {
    ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
      this.setStageStatus(s, '');
      const output = document.getElementById(`output-${s}`);
      if (output) {
        output.innerHTML = '';
        output.classList.remove('open');
      }
    });
    document.getElementById('paper-result')?.classList.add('hidden');
  },

  // ---- Paper Display ----
  showPaper(markdown) {
    const container = document.getElementById('paper-result');
    const content = document.getElementById('paper-content');
    if (!container || !content) return;

    content.innerHTML = this.renderMarkdown(markdown);
    container.classList.remove('hidden');
  },

  // ---- Settings Form ----
  loadSettingsForm() {
    const settings = Storage.getSettings();
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    setVal('input-api-key', settings.apiKey);
    setVal('input-api-base', settings.apiBase);
    setVal('prompt-ideation', settings.promptIdeation);
    setVal('prompt-planning', settings.promptPlanning);
    setVal('prompt-experiment', settings.promptExperiment);
    setVal('prompt-writing', settings.promptWriting);
    if (settings.model) setVal('input-model', settings.model);
  },

  toggleApiKeyVisibility() {
    const input = document.getElementById('input-api-key');
    const btn = input?.nextElementSibling;
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = 'Show';
    }
  },

  // ---- Project Detail ----
  renderProjectDetail(project) {
    document.getElementById('project-title').textContent = project.title || project.id;
    this.currentProjectId = project.id;

    const container = document.getElementById('project-detail-content');
    let html = `
      <div class="detail-section">
        <h3>Project Info</h3>
        <p><strong>ID:</strong> ${this.escapeHtml(project.id)}</p>
        <p><strong>Topics:</strong> ${(project.topics || []).map(t => `<span class="topic-tag">${this.escapeHtml(t)}</span>`).join(' ')}</p>
        <p><strong>Model:</strong> ${this.escapeHtml(project.model || 'gpt-4o')}</p>
        <p><strong>Created:</strong> ${new Date(project.createdAt).toLocaleString()}</p>
        <p><strong>Status:</strong> <span class="status-badge ${project.status}">${project.status}</span></p>
      </div>`;

    if (project.idea) {
      html += `
        <div class="detail-section">
          <h3>1. Ideation</h3>
          <pre>${this.escapeHtml(JSON.stringify(project.idea, null, 2))}</pre>
        </div>`;
    }

    if (project.plan) {
      html += `
        <div class="detail-section">
          <h3>2. Plan</h3>
          <pre>${this.escapeHtml(JSON.stringify(project.plan, null, 2))}</pre>
        </div>`;
    }

    if (project.results) {
      html += `
        <div class="detail-section">
          <h3>3. Experiment Results</h3>
          <pre>${this.escapeHtml(JSON.stringify(project.results, null, 2))}</pre>
        </div>`;
    }

    if (project.paper) {
      html += `
        <div class="detail-section">
          <h3>4. Generated Paper</h3>
          <div class="paper-body">${this.renderMarkdown(project.paper)}</div>
          <div style="margin-top: 12px">
            <button class="btn btn-sm" onclick="App.downloadProjectPaper('md')">Download .md</button>
            <button class="btn btn-sm" onclick="App.downloadProjectPaper('txt')">Download .txt</button>
          </div>
        </div>`;
    }

    container.innerHTML = html;
    this.switchView('project');
  },

  // ---- Helpers ----
  escapeHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  renderMarkdown(md) {
    if (!md) return '';
    // Simple markdown renderer (handles headers, bold, italic, lists, code blocks, paragraphs)
    let html = this.escapeHtml(md);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-input);padding:2px 4px;border-radius:3px;font-size:12px">$1</code>');

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs (lines not already wrapped)
    html = html.replace(/^(?!<[hluop])(.*\S.*)$/gm, '<p>$1</p>');

    // Clean up extra newlines
    html = html.replace(/\n{2,}/g, '\n');

    return html;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },
};


// ============================================================
// APP — Main application controller
// ============================================================
const App = {
  _currentProject: null,

  init() {
    UI.init();

    // Check if API key is set
    const settings = Storage.getSettings();
    if (!settings.apiKey) {
      setTimeout(() => {
        UI.toast('Set your OpenAI API key in Settings to get started', 'info');
      }, 500);
    }
  },

  // ---- Start Research Pipeline ----
  async startResearch() {
    const settings = Storage.getSettings();
    if (!settings.apiKey) {
      UI.toast('Please set your OpenAI API key in Settings first', 'error');
      UI.switchView('settings');
      return;
    }

    const topicsRaw = document.getElementById('input-topics').value.trim();
    if (!topicsRaw) {
      UI.toast('Please enter at least one research topic', 'error');
      return;
    }

    const topics = topicsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const model = document.getElementById('input-model').value;
    const customId = document.getElementById('input-project-id').value.trim();
    const projectId = customId || `project_${Date.now().toString(36)}`;

    // Create project record
    const project = {
      id: projectId,
      topics,
      model,
      createdAt: new Date().toISOString(),
      status: 'running',
      title: projectId,
      idea: null,
      plan: null,
      results: null,
      paper: null,
    };

    Storage.saveProject(project);
    this._currentProject = project;

    // Show pipeline
    const pipeline = document.getElementById('pipeline');
    const form = document.getElementById('research-form');
    pipeline.classList.remove('hidden');
    UI.resetPipeline();

    // Disable start button
    const btn = document.getElementById('btn-start');
    btn.disabled = true;
    btn.textContent = 'Research in progress...';

    try {
      // ---- Stage 1: Ideation ----
      UI.setStageStatus('ideation', 'active');
      const idea = await Agents.ideation(topics);
      project.idea = idea;
      project.title = idea.title || projectId;
      UI.setStageOutput('ideation', idea);
      UI.setStageStatus('ideation', 'completed');
      Storage.saveProject(project);

      // ---- Stage 2: Planning ----
      UI.setStageStatus('planning', 'active');
      const plan = await Agents.planning(idea);
      project.plan = plan;
      UI.setStageOutput('planning', plan);
      UI.setStageStatus('planning', 'completed');
      Storage.saveProject(project);

      // ---- Stage 3: Experiment ----
      UI.setStageStatus('experiment', 'active');
      const results = await Agents.experiment(plan);
      project.results = results;
      UI.setStageOutput('experiment', results);
      UI.setStageStatus('experiment', 'completed');
      Storage.saveProject(project);

      // ---- Stage 4: Writing ----
      UI.setStageStatus('writing', 'active');
      const paper = await Agents.writing(idea, plan, results);
      project.paper = paper;
      UI.setStageOutput('writing', 'Paper generated successfully');
      UI.setStageStatus('writing', 'completed');
      Storage.saveProject(project);

      // Show paper
      UI.showPaper(paper);

      // Mark project complete
      project.status = 'completed';
      Storage.saveProject(project);

      UI.toast('Research completed successfully!', 'success');

    } catch (err) {
      // Mark the current active stage as error
      ['ideation', 'planning', 'experiment', 'writing'].forEach(s => {
        const el = document.getElementById(`stage-${s}`);
        if (el?.classList.contains('active')) {
          UI.setStageStatus(s, 'error');
          UI.setStageOutput(s, `Error: ${err.message}`);
        }
      });

      project.status = 'error';
      project.error = err.message;
      Storage.saveProject(project);

      UI.toast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start Automated Research';
    }
  },

  // ---- Open Project Detail ----
  openProject(id) {
    const project = Storage.getProject(id);
    if (!project) {
      UI.toast('Project not found', 'error');
      return;
    }
    this._currentProject = project;
    UI.renderProjectDetail(project);
  },

  // ---- Re-run a project ----
  rerunProject() {
    if (!this._currentProject) return;
    const p = this._currentProject;
    document.getElementById('input-topics').value = (p.topics || []).join(', ');
    if (p.model) document.getElementById('input-model').value = p.model;
    document.getElementById('input-project-id').value = '';
    UI.switchView('new-research');
  },

  // ---- Delete Project ----
  deleteProject() {
    if (!this._currentProject) return;
    if (!confirm(`Delete project "${this._currentProject.title || this._currentProject.id}"?`)) return;
    Storage.deleteProject(this._currentProject.id);
    this._currentProject = null;
    UI.toast('Project deleted', 'success');
    UI.switchView('dashboard');
  },

  // ---- Download Paper ----
  downloadPaper(format) {
    const project = this._currentProject;
    if (!project?.paper) { UI.toast('No paper to download', 'error'); return; }
    this._downloadText(project.paper, `${project.id}_paper.${format}`, format === 'md' ? 'text/markdown' : 'text/plain');
  },

  downloadProjectPaper(format) {
    this.downloadPaper(format);
  },

  copyPaper() {
    const project = this._currentProject;
    if (!project?.paper) return;
    navigator.clipboard.writeText(project.paper).then(() => UI.toast('Paper copied to clipboard', 'success'));
  },

  // ---- Settings ----
  saveSettings() {
    const settings = {
      apiKey: document.getElementById('input-api-key')?.value?.trim() || '',
      apiBase: document.getElementById('input-api-base')?.value?.trim() || 'https://api.openai.com/v1',
      model: document.getElementById('input-model')?.value || 'gpt-4o',
      promptIdeation: document.getElementById('prompt-ideation')?.value || '',
      promptPlanning: document.getElementById('prompt-planning')?.value || '',
      promptExperiment: document.getElementById('prompt-experiment')?.value || '',
      promptWriting: document.getElementById('prompt-writing')?.value || '',
    };
    Storage.saveSettings(settings);
    UI.toast('Settings saved', 'success');
  },

  // ---- Data Management ----
  exportAllData() {
    const data = Storage.exportAll();
    const json = JSON.stringify(data, null, 2);
    this._downloadText(json, 'openfars_export.json', 'application/json');
    UI.toast('Data exported', 'success');
  },

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Storage.importAll(data);
        UI.toast('Data imported successfully. Refreshing...', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch {
        UI.toast('Invalid data file', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  },

  clearAllData() {
    if (!confirm('This will delete ALL projects and settings. Are you sure?')) return;
    Storage.clearAll();
    UI.toast('All data cleared. Refreshing...', 'success');
    setTimeout(() => location.reload(), 1000);
  },

  // ---- Utility ----
  _downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};


// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => App.init());
