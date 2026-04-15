/**
 * preview.js — forge.ui
 * Manages the preview iframe.
 * For multi-file projects it inlines CSS and JS into index.html before rendering.
 */

const Preview = {
  _currentHtml: '',  // Last rendered HTML (for refresh / open-in-tab)
  _currentEntry: 'index.html', // Last HTML file rendered (for multi-page navigation)

  /* ─────────────────────────────────────────────
     RENDER MULTIPLE FILES
  ───────────────────────────────────────────── */

  /**
   * Take an array of files, combine them, and render in the iframe.
   * Inlines all <link rel="stylesheet"> and <script src="..."> references
   * regardless of attribute order, defer/async, self-closing tags, or path prefixes.
   *
   * @param {Array<{name, content}>} files
   * @param {string} entryHint - optional filename of the HTML page to display
   */
  renderFiles(files, entryHint = null) {
    // Build a lookup map: normalised filename → content
    const map = {};
    for (const f of files) {
      map[f.name] = f.content;
      // Also store without leading ./ or / so any path variant resolves
      const bare = f.name.replace(/^\.?\//, '');
      if (bare !== f.name) map[bare] = f.content;
    }

    /** Resolve a href/src value to file content (case-insensitive basename fallback) */
    const resolve = (ref) => {
      const bare = ref.replace(/^\.?\//, '');
      if (map[ref])  return map[ref];
      if (map[bare]) return map[bare];
      // basename fallback (handles subdirectory paths like css/style.css → style.css)
      const base = bare.split('/').pop();
      for (const key of Object.keys(map)) {
        if (key.split('/').pop() === base) return map[key];
      }
      return null;
    };

    // Determine the main HTML file to render
    let entryNames = [];
    if (entryHint && /\.html?$/i.test(entryHint)) entryNames.push(entryHint);
    entryNames.push(this._currentEntry);
    entryNames.push('index.html');

    let html = '';
    for (const name of entryNames) {
      if (name && map[name]) {
        html = map[name];
        this._currentEntry = name;
        break;
      }
    }

    if (!html) {
      const htmlFile = files.find(f => /\.html?$/i.test(f.name));
      if (htmlFile) {
        html = htmlFile.content;
        this._currentEntry = htmlFile.name;
      }
    }

    if (!html) {
      this._write('<p style="font-family:monospace;padding:20px;color:#f87171">No index.html found in generated files.</p>');
      return;
    }

    // ── Inline ALL <link …> tags that are stylesheets ──
    // Handles any attribute order and self-closing variants
    html = html.replace(/<link\b([^>]*?)(?:\/>|>)/gi, (match, attrs) => {
      const relMatch  = attrs.match(/rel=["']([^"']*)["']/i);
      const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
      if (!relMatch || !hrefMatch) return match;
      if (relMatch[1].toLowerCase() !== 'stylesheet') return match;
      const css = resolve(hrefMatch[1]);
      return css ? `<style>\n/* inlined: ${hrefMatch[1]} */\n${css}\n</style>` : match;
    });

    // ── Inline ALL <script src="…"> tags ──
    // Handles defer, async, type, and any other attributes in any order
    html = html.replace(/<script\b([^>]*)><\/script>/gi, (match, attrs) => {
      const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
      if (!srcMatch) return match;
      const js = resolve(srcMatch[1]);
      return js ? `<script>\n/* inlined: ${srcMatch[1]} */\n${js}\n</script>` : match;
    });

    // ── Inject Navigation Interceptor ──
    // Enables clicking links to local HTML files in the multi-file preview
    const interceptScript = `
<script>
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && a.getAttribute('href')) {
      const href = a.getAttribute('href');
      if (!href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#') && !href.startsWith('mailto:')) {
        e.preventDefault();
        window.parent.postMessage({ type: 'FORGE_NAV', href: href }, '*');
      }
    }
  });
</script>
`;
    if (html.toLowerCase().includes('</body>')) {
      html = html.replace(/<\/body>/i, interceptScript + '</body>');
    } else {
      html += interceptScript;
    }

    this._currentHtml = html;
    this._write(html);
    this._hideWelcome();
  },

  /* ─────────────────────────────────────────────
     RENDER SINGLE HTML STRING
  ───────────────────────────────────────────── */

  renderHtml(html) {
    this._currentHtml = html;
    this._write(html);
    this._hideWelcome();
  },

  /* ─────────────────────────────────────────────
     REFRESH / OPEN
  ───────────────────────────────────────────── */

  refresh() {
    if (this._currentHtml) this._write(this._currentHtml);
  },

  openInNewTab() {
    if (!this._currentHtml) return;
    const blob = new Blob([this._currentHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  },

  /* ─────────────────────────────────────────────
     VIEWPORT CONTROL
  ───────────────────────────────────────────── */

  setViewport(width) {
    const frame = document.getElementById('preview-frame');
    if (width === '100%') {
      frame.style.cssText = 'width:100%;height:100%;border:none;margin:0;border-radius:0;';
    } else {
      frame.style.cssText = `width:${width};height:calc(100% - 32px);border:1px solid #2a2a40;margin:16px auto;border-radius:10px;display:block;box-shadow:0 8px 40px rgba(0,0,0,0.4);`;
    }
  },

  /* ─────────────────────────────────────────────
     LOADING INDICATOR
  ───────────────────────────────────────────── */

  setLoading(show) {
    const el = document.getElementById('preview-loading');
    if (show) el.classList.add('show');
    else      el.classList.remove('show');
  },

  /* ─────────────────────────────────────────────
     PRIVATE
  ───────────────────────────────────────────── */

  _write(html) {
    const frame = document.getElementById('preview-frame');
    const doc   = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    this._hideWelcome();
  },

  _hideWelcome() {
    document.getElementById('preview-welcome')?.classList.add('hidden');
  },
};
