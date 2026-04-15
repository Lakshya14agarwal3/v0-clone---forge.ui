/**
 * config.js — forge.ui
 * Central configuration: models, generation modes, prompt templates.
 * Edit this file to add models, change prompts, or tweak behaviour.
 */

/* ── Storage keys ── */
const STORAGE = {
  API_KEY: 'forge_api_key',
  MODEL: 'forge_model',
  MODE: 'forge_mode',
};

/* ── OpenRouter endpoint ── */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* ── API Key (hardcoded — paste your key here) ── */
const OPENROUTER_API_KEY = 'place your api key ';

/* ── Available models ── */
// Add or remove models here. id must match OpenRouter's model string.
const MODELS = [
  // Anthropic
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', group: 'Anthropic 🔥' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', group: 'Anthropic 🔥' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (Fast)', group: 'Anthropic 🔥' },
  // OpenAI
  { id: 'openai/gpt-4o', label: 'GPT-4o', group: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (Fast)', group: 'OpenAI' },
  { id: 'openai/gpt-4.1', label: 'GPT-4.1', group: 'OpenAI' },
  // Google
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', group: 'Google' },
  { id: 'google/gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro', group: 'Google' },
  // DeepSeek
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', group: 'DeepSeek' },
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 (Reasoning)', group: 'DeepSeek' },
  // xAI
  { id: 'x-ai/grok-3-beta', label: 'Grok 3 Beta', group: 'xAI' },
  // Meta
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', group: 'Meta' },
  // Mistral
  { id: 'mistralai/mistral-large', label: 'Mistral Large', group: 'Mistral' },
  { id: 'mistralai/codestral-2501', label: 'Codestral (Code-focused)', group: 'Mistral' },
];



/* ── Generation modes ── */
const MODES = {
  /**
   * MULTI-FILE: Returns JSON with separate HTML, CSS, JS files.
   * Best for full websites and multi-page projects.
   */
  multifile: {
    label: 'multi-file',
    maxTokens: 14000,
    temperature: 0.7,
    systemPrompt: `You are an elite full-stack web developer and UI/UX designer. Build complete, production-ready websites from user descriptions.

═══════════════════════════════════════════
OUTPUT FORMAT — CRITICAL
═══════════════════════════════════════════
Return ONLY a valid JSON object. No markdown fences. No explanation. No text before or after. Just the raw JSON.

{
  "title": "Project name",
  "description": "One-line description",
  "files": [
    { "name": "index.html",  "language": "html",       "content": "<!DOCTYPE html>..." },
    { "name": "style.css",   "language": "css",        "content": "..." },
    { "name": "script.js",   "language": "javascript", "content": "..." }
  ]
}

For multi-page sites add more html files:
    { "name": "about.html",   "language": "html", "content": "..." },
    { "name": "contact.html", "language": "html", "content": "..." }

═══════════════════════════════════════════
DEVELOPMENT RULES
═══════════════════════════════════════════
1. ALWAYS include index.html as main entry point
2. index.html must link: <link rel="stylesheet" href="style.css"> and <script src="script.js" defer></script>
3. For multi-page: all pages share the same style.css and script.js
4. Write COMPLETE, working code — no TODOs, no "// add content here", no placeholders in logic
5. Include realistic, meaningful placeholder content (actual text, numbers, names — not lorem ipsum)
6. Use modern HTML5 semantics: <header>, <nav>, <main>, <section>, <article>, <footer>
7. All CSS in style.css; all JS in script.js (unless very small inline necessity)
8. Avoid inline styles except for dynamic values

DESIGN STANDARDS:
- Google Fonts via @import in style.css (choose distinctive, character-rich fonts — NOT Inter or Roboto)
- Fully responsive (mobile-first, with breakpoints at 768px and 480px)
- Smooth animations: scroll-reveal, hover states, transitions (CSS preferred, JS for complex ones)
- Professional color palette with CSS custom properties (--variables)
- Micro-interactions on all interactive elements
- Realistic shadows, gradients, and layered depth

FUNCTIONALITY STANDARDS:
- All navigation links work (internal anchors or between pages)
- Forms have client-side validation with visual feedback
- Interactive components fully functional (tabs, accordions, modals, carousels)
- Smooth scroll behavior
- Mobile hamburger menu if applicable
- LocalStorage for any persistent state
- For charts/graphs: use Chart.js from CDN <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
- For icons: inline SVGs or carefully chosen Unicode

QUALITY BAR: The result must look like it was built by a senior developer at a top design agency. Not a template — a bespoke, thoughtful design.`,
  },

  /**
   * SINGLE-FILE: One complete self-contained HTML document.
   * Best for landing pages, components, quick prototypes.
   */
  singlefile: {
    label: 'single-file',
    maxTokens: 10000,
    temperature: 0.7,
    systemPrompt: `You are an expert frontend developer. Generate a single, self-contained HTML file.

CRITICAL: Return ONLY raw HTML starting with <!DOCTYPE html>. No markdown fences, no backticks, no explanation.

RULES:
1. All CSS inside <style> in <head>
2. All JavaScript inside <script defer> before </body>
3. Completely self-contained (CDN links allowed)
4. Google Fonts via <link rel="stylesheet" href="https://fonts.googleapis.com/...">
5. Chart.js from CDN if needed: https://cdn.jsdelivr.net/npm/chart.js
6. Fully responsive — mobile and desktop
7. Smooth animations and micro-interactions
8. Complete working code — no placeholders, no TODOs
9. Realistic placeholder content
10. Agency-quality design with distinctive typography and color`,
  },

  /**
   * COMPONENT: A focused UI component or widget.
   * Best for navbars, cards, forms, modals, hero sections, etc.
   */
  component: {
    label: 'component',
    maxTokens: 6000,
    temperature: 0.75,
    systemPrompt: `You are a UI component specialist. Generate a polished, production-ready HTML component.

CRITICAL: Return ONLY raw HTML. No markdown, no backticks, no explanation.

RULES:
1. Full page wrapper to showcase the component properly
2. All CSS and JS inline (self-contained)
3. Focus on ONE specific UI element, done exceptionally well
4. Hover states, transitions, animations — all polished
5. Responsive and accessible (aria attributes where relevant)
6. Google Fonts allowed via <link>
7. No external dependencies unless clearly needed (Chart.js, etc.)`,
  },
};

/* ── Quick-start prompt chips ── */
const PROMPT_CHIPS = [
  {
    label: '🏠 Portfolio',
    prompt: 'A stunning personal portfolio for a full-stack developer with dark theme, animated hero, skills grid with progress indicators, project cards with live demo/github links and modals, and a contact form. Multi-page: index, projects, contact.',
  },
  {
    label: '🛒 E-commerce',
    prompt: 'A modern e-commerce store for premium sneakers with product grid, filter sidebar (brand, size, price), product detail modal, shopping cart sidebar, hero banner with countdown timer, and newsletter section.',
  },
  {
    label: '📊 Dashboard',
    prompt: 'A SaaS analytics dashboard with collapsible sidebar nav, revenue area chart (Chart.js), weekly bar chart, 4 KPI stat cards, user activity feed, data table with sorting and pagination, and dark/light toggle.',
  },
  {
    label: '🌐 Agency',
    prompt: 'A creative digital agency website with bold typographic hero, animated services grid, portfolio with filterable gallery, team section, client logos ticker, testimonials, and a floating contact CTA. Multi-page.',
  },
  {
    label: '🍕 Restaurant',
    prompt: 'A restaurant website with cinematic full-screen hero, tabbed menu (starters, mains, desserts, drinks) with prices, about story section, photo gallery masonry grid, online reservation form with date picker, and footer with embedded map link.',
  },
  {
    label: '🚀 SaaS Landing',
    prompt: 'A SaaS landing page for a project management tool with animated hero (floating UI mockup), feature bento grid, pricing table (3 tiers, monthly/annual toggle), testimonials carousel, FAQ accordion, and CTA sections.',
  },
  {
    label: '📝 Blog',
    prompt: 'A minimal editorial blog with large typographic hero, featured post, article grid with category tags, individual article layout with estimated reading time and table of contents sidebar, author bio, and related posts.',
  },
  {
    label: '🎵 Music App',
    prompt: 'A Spotify-style music player UI with sidebar (library, playlists, artists), album browsing grid, now-playing bar with animated waveform, playlist detail view, dark glassmorphism aesthetic.',
  },
];
