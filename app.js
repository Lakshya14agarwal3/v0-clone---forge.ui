/**
 * app.js — forge.ui
 * Main application logic.
 * Wires together Editor, Preview, and API modules.
 * Handles: model selection, mode switching, generation pipeline,
 *          chat history, ZIP download, and all UI events.
 */

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const App = {
  /* ── State ── */
  mode: localStorage.getItem(STORAGE.MODE) || 'multifile',
  model: 'google/gemini-2.0-flash-001',
  chatHistory: [], // [{role:'user'|'assistant', content}]
  isGenerating: false,

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */

  init() {
    Editor.init();
    this._populatePromptChips();
    this._restoreSettings();
    this._bindAll();
    this._syncModeBadge();
  },

  /* ─────────────────────────────────────────────
     SETUP HELPERS
  ───────────────────────────────────────────── */



  _populatePromptChips() {
    const container = $('prompt-chips');
    container.innerHTML = PROMPT_CHIPS.map(chip => `
      <button class="prompt-chip" title="${App._esc(chip.prompt)}">${chip.label}</button>
    `).join('');
    container.querySelectorAll('.prompt-chip').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        $('prompt-input').value = PROMPT_CHIPS[i].prompt;
        $('prompt-input').dispatchEvent(new Event('input'));
        $('prompt-input').focus();
      });
    });
  },

  _restoreSettings() {
    // Restore active mode button
    $$('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });
  },

  /* ─────────────────────────────────────────────
     BIND ALL EVENTS
  ───────────────────────────────────────────── */

  _bindAll() {
    /* Generate button */
    $('generate-btn').addEventListener('click', () => this._generate());

    /* Enter = generate, Shift+Enter = newline */
    $('prompt-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._generate();
      }
    });

    /* Auto-resize prompt textarea */
    $('prompt-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    /* Settings panel toggle */
    $('settings-btn').addEventListener('click', e => {
      e.stopPropagation();
      $('settings-panel').classList.toggle('open');
    });
    document.addEventListener('click', e => {
      const panel = $('settings-panel');
      if (!panel.contains(e.target) && e.target.id !== 'settings-btn') {
        panel.classList.remove('open');
      }
    });

    /* Mode buttons */
    $$('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        localStorage.setItem(STORAGE.MODE, this.mode);
        $$('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._syncModeBadge();
      });
    });

    /* Viewport buttons */
    $$('.vp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.vp-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Preview.setViewport(btn.dataset.width);
      });
    });

    /* Preview action buttons — refresh re-inlines in multi-file mode */
    $('refresh-btn').addEventListener('click', () => {
      if (this.mode === 'multifile' && Editor.hasFiles()) {
        Preview.renderFiles(Editor.getAllFiles());
      } else {
        Preview.refresh();
      }
    });
    $('open-tab-btn').addEventListener('click', () => Preview.openInNewTab());
    $('copy-code-btn').addEventListener('click', () => this._copyActiveCode());

    /* Download ZIP */
    $('download-btn').addEventListener('click', () => this._downloadZip());

    /* Clear chat */
    $('clear-chat-btn').addEventListener('click', () => {
      this.chatHistory = [];
      $('chat-history').innerHTML = '<div class="chat-empty">No history yet</div>';
    });

    /* New file (sidebar + button) */
    $('new-file-btn').addEventListener('click', () => this._addNewFile());

    /* Live editor → preview sync (debounced) */
    let _syncTimer;
    Editor.cm?.on('change', () => {
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => {
        if (!Editor.activeFile) return;

        if (this.mode === 'multifile') {
          // Re-inline all files and re-render preview
          if (Editor.hasFiles()) {
            Preview.renderFiles(Editor.getAllFiles(), Editor.activeFile);
          }
        } else if (Editor.activeFile === 'index.html') {
          const code = Editor.getActiveContent();
          if (code.includes('<!DOCTYPE') || code.includes('<html')) {
            Preview.renderHtml(code);
          }
        }
      }, 900);
    });

    /* Editor tab switch -> update preview entry point */
    Editor.onFileOpen = name => {
      if (this.mode === 'multifile' && Editor.hasFiles()) {
        Preview.renderFiles(Editor.getAllFiles(), name);
      }
    };

    /* Intercept preview navigation (from iframe) */
    window.addEventListener('message', e => {
      if (e.data?.type === 'FORGE_NAV') {
        let href = e.data.href.replace(/^\.?\//, '');
        href = href.split(/[?#]/)[0]; // Remove hash or query
        if (Editor.files[href]) {
          Editor.openFile(href);
        } else if (!href.endsWith('.html') && Editor.files[href + '.html']) {
          Editor.openFile(href + '.html');
        } else {
          this._toast(`File not found: ${href}`, 'error');
        }
      }
    });
  },

  /* ─────────────────────────────────────────────
     GENERATION PIPELINE
  ───────────────────────────────────────────── */

  async _generate() {
    if (this.isGenerating) return;

    const promptEl = $('prompt-input');
    const prompt = promptEl.value.trim();

    if (!prompt) {
      this._toast('Enter a prompt first', 'error');
      promptEl.focus();
      return;
    }

    if (!API.isKeyValid(API.getKey())) {
      this._toast('Set your OpenRouter API key in config.js (OPENROUTER_API_KEY)', 'error');
      return;
    }

    /* ── Start ── */
    this.isGenerating = true;
    this._setGenerating(true);
    this._addChatMsg('user', prompt);
    Preview.setLoading(true);
    this._setStatus('running', 'Sending to ' + this._modelLabel() + '...');
    this._setBadge('work', '● WORKING');

    /* Prepare streaming variables */
    let rawFull = '';
    const isMulti = this.mode === 'multifile';

    /* For single/component: stream directly into editor */
    if (!isMulti) {
      Editor.clear();
      Editor.setFile('index.html', '', 'html');
      Editor.openFile('index.html');
    }

    /* Build prompt with context if iterating */
    const contextualPrompt = this._buildPrompt(prompt);

    /* Snapshot history before starting (max last 10 messages = 5 exchanges) */
    const historySnapshot = this.chatHistory.slice(-10);

    await API.stream({
      userPrompt: contextualPrompt,
      model: this.model,
      mode: this.mode,
      history: historySnapshot,

      onStatus: msg => this._setStatus('running', msg),

      onChunk: (_chunk, fullText) => {
        rawFull = fullText;
        this._setStatus('running', `Generating… (${fullText.length.toLocaleString()} chars)`);

        if (!isMulti) {
          /* Stream into editor live */
          Editor.streamInto('index.html', fullText);
          /* Attempt live preview if we have a complete-ish HTML doc */
          if (fullText.includes('</body>') || fullText.includes('</html>')) {
            Preview.renderHtml(this._cleanHtml(fullText));
            Preview.setLoading(false);
          }
        }
      },

      onDone: fullText => {
        rawFull = fullText;
        this._processResponse(fullText, prompt);

        /* Save to chat history */
        this.chatHistory.push({ role: 'user', content: prompt });
        this.chatHistory.push({ role: 'assistant', content: fullText });

        /* Reset UI */
        this.isGenerating = false;
        this._setGenerating(false);
        promptEl.value = '';
        promptEl.style.height = '';
      },

      onError: errMsg => {
        this._setStatus('error', 'Error: ' + errMsg);
        this._setBadge('error', '● ERROR');
        this._addChatMsg('error', errMsg);
        Preview.setLoading(false);
        this._toast(errMsg, 'error');
        this.isGenerating = false;
        this._setGenerating(false);
      },
    });
  },

  /* ─────────────────────────────────────────────
     RESPONSE PROCESSOR
  ───────────────────────────────────────────── */

  _processResponse(raw, originalPrompt) {
    Preview.setLoading(false);

    if (this.mode === 'multifile') {
      /* Parse JSON response */
      const parsed = this._extractJson(raw);
      if (parsed && Array.isArray(parsed.files) && parsed.files.length > 0) {
        Editor.loadFiles(parsed.files);
        Preview.renderFiles(parsed.files);
        const fileNames = parsed.files.map(f => f.name).join(', ');
        this._setStatus('done', `Generated ${parsed.files.length} files - ${parsed.title || 'project ready'}`);
        this._addChatMsg('ai', `✓ ${parsed.files.length} files: ${fileNames}`);
        this._setBadge('live', '● LIVE');
      } else {
        /* Fallback: model returned raw HTML instead of JSON */
        const html = this._cleanHtml(raw);
        if (html.includes('<html') || html.includes('<!DOCTYPE')) {
          Editor.loadFiles([{ name: 'index.html', content: html, language: 'html' }]);
          Preview.renderHtml(html);
          this._setStatus('done', 'Generated (single-file fallback)');
          this._addChatMsg('ai', '✓ Generated as single HTML (model returned non-JSON)');
          this._setBadge('live', '● LIVE');
          this._toast('Model returned HTML instead of JSON - displayed as single file', 'info');
        } else {
          this._setStatus('error', 'Could not parse response');
          this._addChatMsg('error', 'Response could not be parsed. Try rephrasing or switching to Single File mode.');
          this._setBadge('error', '● ERROR');
        }
      }
    } else {
      /* Single file or component */
      const html = this._cleanHtml(raw);
      Editor.setFile('index.html', html, 'html');
      Editor.openFile('index.html');
      Preview.renderHtml(html);
      this._setStatus('done', `${this.mode === 'component' ? 'Component' : 'Page'} generated (${html.length.toLocaleString()} chars)`);
      this._addChatMsg('ai', `✓ ${this.mode === 'component' ? 'Component' : 'Page'} ready`);
      this._setBadge('live', '● LIVE');
    }
  },

  /* ─────────────────────────────────────────────
     JSON PARSER (robust)
  ───────────────────────────────────────────── */

  _extractJson(raw) {
    // 1. Direct parse
    try { return JSON.parse(raw.trim()); } catch { }

    // 2. Strip markdown fences AND any naked "json" prefix
    let stripped = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    if (stripped.toLowerCase().startsWith('json\n')) {
      stripped = stripped.substring(5).trim();
    }

    // Helper to fix unescaped newlines inside JSON strings before parsing
    const parseSecure = (text) => {
      try { return JSON.parse(text); } catch (e) {
        // If it failed because of raw newlines, try to escape them
        // This regex matches newlines globally, but we only want to escape them if they are inside a string.
        // A simple heuristic for LLM JSON output: replace all literal newlines with \\n
        // except those that are immediately followed by { or } or ] or "
        const escaped = text.replace(/\n(?![\]{}" ])/g, '\\n');
        try { return JSON.parse(escaped); } catch { return null; }
      }
    };

    const res = parseSecure(stripped);
    if (res) return res;

    // 3. Greedy match: find outermost {...}
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return parseSecure(raw.slice(start, end + 1));
    }

    return null;
  },

  /* ─────────────────────────────────────────────
     CONTEXT BUILDER (for iterative prompts)
  ───────────────────────────────────────────── */

  _buildPrompt(userPrompt) {
    const files = Editor.getAllFiles();
    // If we have existing files and a chat history, add context
    if (files.length > 0 && this.chatHistory.length > 0) {
      const fileList = files.map(f => f.name).join(', ');
      return `Current project files: ${fileList}\n\nInstruction: ${userPrompt}`;
    }
    return userPrompt;
  },

  /* ─────────────────────────────────────────────
     DOWNLOAD ZIP
  ───────────────────────────────────────────── */

  async _downloadZip() {
    const files = Editor.getAllFiles();
    if (files.length === 0) {
      this._toast('No files to download', 'error');
      return;
    }
    if (typeof JSZip === 'undefined') {
      this._toast('JSZip not available', 'error');
      return;
    }

    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.name, f.content);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'forge-ui-project.zip' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    this._toast(`Downloaded ${files.length} files as ZIP ✓`, 'success');
  },

  /* ─────────────────────────────────────────────
     ADD NEW FILE (sidebar button)
  ───────────────────────────────────────────── */

  _addNewFile() {
    const name = window.prompt('File name (e.g. about.html, components.css, utils.js):');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    Editor.setFile(trimmed, '', Editor._detectLang(trimmed));
    Editor.openFile(trimmed);
    this._toast(`Created ${trimmed}`, 'info');
  },

  /* ─────────────────────────────────────────────
     COPY ACTIVE FILE
  ───────────────────────────────────────────── */

  _copyActiveCode() {
    const code = Editor.getActiveContent();
    if (!code) { this._toast('Nothing to copy', 'error'); return; }
    navigator.clipboard.writeText(code).then(() => {
      this._toast('Copied to clipboard ✓', 'success');
    }).catch(() => {
      this._toast('Copy failed - try Ctrl+A, Ctrl+C in the editor', 'error');
    });
  },

  /* ─────────────────────────────────────────────
     CHAT HISTORY
  ───────────────────────────────────────────── */

  _addChatMsg(role, content) {
    const container = $('chat-history');
    const emptyEl = container.querySelector('.chat-empty');
    if (emptyEl) emptyEl.remove();

    const div = document.createElement('div');
    div.className = `chat-msg chat-${role}`;
    div.innerHTML = `
      <div class="chat-role">${role === 'user' ? 'You' : role === 'ai' ? 'AI' : '⚠ Error'}</div>
      <div class="chat-content">${this._esc(content)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  /* ─────────────────────────────────────────────
     STATUS / BADGE / TOAST
  ───────────────────────────────────────────── */

  _setStatus(type, text) {
    $('status-dot').className = 'status-dot ' + type;
    $('status-text').textContent = text;
  },

  _setBadge(cls, text) {
    const badge = $('live-badge');
    badge.className = `live-badge ${cls}`;
    badge.textContent = text;
  },

  _setGenerating(gen) {
    const btn = $('generate-btn');
    btn.disabled = gen;
    btn.querySelector('.gen-label').textContent = gen ? 'Generating…' : 'Generate';
    btn.querySelector('.gen-icon').textContent = gen ? '⏳' : '⚡';
  },

  _syncModeBadge() {
    $('mode-pill').textContent = MODES[this.mode]?.label || this.mode;
  },

  _modelLabel() {
    return 'google/gemini-2.0-flash-001';
  },

  _toast(msg, type = 'info') {
    const container = $('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    // Animate in
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    // Animate out
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 350);
    }, 3500);
  },

  /* ─────────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────────── */

  _cleanHtml(raw) {
    return raw
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },
};

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => App.init());
