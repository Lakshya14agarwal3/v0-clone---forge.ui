/**
 * editor.js — forge.ui
 * Manages the CodeMirror editor instance, virtual file system, and file tabs.
 * Each file is stored in memory and rendered in a tab strip.
 */

const Editor = {
  /* ── State ── */
  cm:         null,   // CodeMirror instance
  files:      {},     // { "filename": { content, language, modified } }
  activeFile: null,   // currently open filename
  onFileOpen: null,   // callback when file opens

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  init() {
    const textarea = document.getElementById('cm-textarea');

    this.cm = CodeMirror.fromTextArea(textarea, {
      theme:          'material-darker',
      lineNumbers:    true,
      lineWrapping:   false,
      tabSize:        2,
      indentWithTabs: false,
      autoCloseTags:  true,
      matchBrackets:  true,
      mode:           'htmlmixed',
      extraKeys: {
        // Tab / Shift-Tab for indent
        'Tab':       cm => cm.execCommand('indentMore'),
        'Shift-Tab': cm => cm.execCommand('indentLess'),
        // Ctrl/Cmd+/ for comment toggle
        'Ctrl-/':    cm => cm.execCommand('toggleComment'),
        'Cmd-/':     cm => cm.execCommand('toggleComment'),
      },
    });

    this.cm.setSize('100%', '100%');

    // Sync back to virtual FS on every change
    this.cm.on('change', () => {
      if (!this.activeFile) return;
      this.files[this.activeFile].content  = this.cm.getValue();
      this.files[this.activeFile].modified = true;
      this._markTabDirty(this.activeFile);
    });

    // Start hidden until files are loaded
    this._showPlaceholder(true);
  },

  /* ─────────────────────────────────────────────
     LOAD FILES (from API response)
  ───────────────────────────────────────────── */

  /**
   * Replace all files with a new set.
   * @param {Array<{name, content, language}>} fileList
   */
  loadFiles(fileList) {
    this.files = {};
    for (const f of fileList) {
      this.files[f.name] = {
        content:  f.content,
        language: f.language || this._detectLang(f.name),
        modified: false,
      };
    }
    this._renderTabs();
    this._renderTree();

    // Prefer index.html, else first file
    const first = fileList.find(f => f.name === 'index.html') || fileList[0];
    if (first) this.openFile(first.name);

    this._showPlaceholder(false);
  },

  /* ─────────────────────────────────────────────
     OPEN / CLOSE FILES
  ───────────────────────────────────────────── */

  openFile(name) {
    if (!this.files[name]) return;
    this.activeFile = name;

    const file = this.files[name];
    this.cm.setValue(file.content);
    this.cm.setOption('mode', this._modeFor(file.language));
    this.cm.clearHistory();
    this.cm.focus();

    this._renderTabs();   // re-render to update active state
    this._renderTree();
    this._showPlaceholder(false);

    if (this.onFileOpen) this.onFileOpen(name);
  },

  closeFile(name) {
    if (!this.files[name]) return;
    delete this.files[name];

    if (this.activeFile === name) {
      const remaining = Object.keys(this.files);
      this.activeFile = remaining[0] || null;
      if (this.activeFile) {
        this.openFile(this.activeFile);
      } else {
        this.cm.setValue('');
        this._showPlaceholder(true);
      }
    }
    this._renderTabs();
    this._renderTree();
  },

  /* ─────────────────────────────────────────────
     ADD / UPDATE FILE
  ───────────────────────────────────────────── */

  /**
   * Add or overwrite a single file.
   */
  setFile(name, content, language) {
    const isNew = !this.files[name];
    this.files[name] = {
      content,
      language: language || this._detectLang(name),
      modified: false,
    };
    if (isNew) {
      this._renderTabs();
      this._renderTree();
    }
    if (this.activeFile === name) {
      const pos = this.cm.getCursor();
      this.cm.setValue(content);
      this.cm.setCursor(pos);
    }
  },

  /* ─────────────────────────────────────────────
     STREAMING SUPPORT
  ───────────────────────────────────────────── */

  /**
   * Called repeatedly during streaming to update file content live.
   * Shows in editor only if the file is currently active.
   */
  streamInto(name, fullText) {
    if (!this.files[name]) {
      this.files[name] = {
        content:  '',
        language: this._detectLang(name),
        modified: false,
      };
      this._renderTabs();
      this._renderTree();
    }
    this.files[name].content = fullText;

    if (this.activeFile === name) {
      // Preserve scroll, update content
      const scroll = this.cm.getScrollInfo();
      this.cm.setValue(fullText);
      this.cm.scrollTo(scroll.left, scroll.top);
    }
  },

  /* ─────────────────────────────────────────────
     GETTERS
  ───────────────────────────────────────────── */

  getAllFiles() {
    return Object.entries(this.files).map(([name, f]) => ({
      name,
      content:  f.content,
      language: f.language,
    }));
  },

  getActiveContent() {
    return this.cm ? this.cm.getValue() : '';
  },

  getFile(name) {
    return this.files[name] || null;
  },

  hasFiles() {
    return Object.keys(this.files).length > 0;
  },

  /* ─────────────────────────────────────────────
     CLEAR
  ───────────────────────────────────────────── */

  clear() {
    this.files      = {};
    this.activeFile = null;
    this.cm.setValue('');
    this.cm.clearHistory();
    this._renderTabs();
    this._renderTree();
    this._showPlaceholder(true);
  },

  /* ─────────────────────────────────────────────
     PRIVATE — RENDER TABS
  ───────────────────────────────────────────── */

  _renderTabs() {
    const container = document.getElementById('file-tabs');
    const names = Object.keys(this.files);

    if (names.length === 0) {
      container.innerHTML = '<span class="no-tabs-hint">No files open</span>';
      return;
    }

    container.innerHTML = names.map(name => {
      const f      = this.files[name];
      const active = name === this.activeFile ? ' active' : '';
      return `
        <div class="file-tab${active}" data-file="${this._esc(name)}" title="${this._esc(name)}">
          <span class="tab-icon">${this._icon(name)}</span>
          <span class="tab-name">${this._esc(name)}${f.modified ? ' *' : ''}</span>
          <span class="tab-close" data-close="${this._esc(name)}">×</span>
        </div>
      `;
    }).join('');

    // Tab click — open file
    container.querySelectorAll('.file-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        if (!e.target.dataset.close) {
          this.openFile(tab.dataset.file);
        }
      });
    });

    // Close button
    container.querySelectorAll('.tab-close').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.closeFile(btn.dataset.close);
      });
    });
  },

  /* ─────────────────────────────────────────────
     PRIVATE — RENDER SIDEBAR TREE
  ───────────────────────────────────────────── */

  _renderTree() {
    const tree  = document.getElementById('file-tree');
    const names = Object.keys(this.files);

    if (names.length === 0) {
      tree.innerHTML = '<div class="tree-empty">No files yet</div>';
      return;
    }

    tree.innerHTML = names.map(name => `
      <div class="tree-item${name === this.activeFile ? ' active' : ''}" data-file="${this._esc(name)}" title="${this._esc(name)}">
        <span class="tree-item-icon">${this._icon(name)}</span>
        <span>${this._esc(name)}</span>
      </div>
    `).join('');

    tree.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', () => this.openFile(item.dataset.file));
    });
  },

  /* ─────────────────────────────────────────────
     PRIVATE — DIRTY MARKER
  ───────────────────────────────────────────── */

  _markTabDirty(name) {
    const tab = document.querySelector(`.file-tab[data-file="${name}"] .tab-name`);
    if (tab && !tab.textContent.endsWith(' *')) {
      tab.textContent += ' *';
    }
  },

  /* ─────────────────────────────────────────────
     PRIVATE — PLACEHOLDER
  ───────────────────────────────────────────── */

  _showPlaceholder(show) {
    const ph = document.getElementById('editor-placeholder');
    const cm = document.querySelector('#editor-body .CodeMirror');
    if (ph) ph.style.display = show ? 'flex' : 'none';
    if (cm) cm.style.display = show ? 'none' : '';
  },

  /* ─────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────── */

  _detectLang(name) {
    if (/\.html?$/i.test(name))   return 'html';
    if (/\.css$/i.test(name))     return 'css';
    if (/\.js$/i.test(name))      return 'javascript';
    if (/\.json$/i.test(name))    return 'json';
    if (/\.md$/i.test(name))      return 'markdown';
    return 'html';
  },

  _modeFor(lang) {
    const MAP = {
      html:       'htmlmixed',
      css:        'css',
      javascript: 'javascript',
      json:       { name: 'javascript', json: true },
    };
    return MAP[lang] || 'htmlmixed';
  },

  _icon(name) {
    if (/\.html?$/i.test(name)) return '🌐';
    if (/\.css$/i.test(name))   return '🎨';
    if (/\.js$/i.test(name))    return '⚡';
    if (/\.json$/i.test(name))  return '{}';
    if (/\.md$/i.test(name))    return '📝';
    return '📄';
  },

  _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};
