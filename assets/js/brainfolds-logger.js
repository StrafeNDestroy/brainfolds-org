/**
 * brainfolds-logger.js — Brainfolds Debug Logger
 *
 * Standards: structured entries, severity levels, session correlation,
 * performance timing, global error capture, localStorage persistence,
 * exportable NDJSON + human-readable formats, console intercept.
 *
 * Usage:
 *   BFLog.error('source', 'message', data)
 *   BFLog.warn('source', 'message', data)
 *   BFLog.info('source', 'message', data)
 *   BFLog.perfStart('label') / BFLog.perfEnd('label')
 *   BFLog.exportLog()          — download .ndjson
 *   BFLog.exportLog('text')    — download .log
 *   BFLog.snapshot()           — capture all form fields
 */

const BFLog = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const VERSION     = '1.0.0';
  const MAX_ENTRIES = 500;
  const PERSIST_KEY = 'bf_debug_log';
  const DEBOUNCE_MS = 500;   // short debounce so log-viewer picks up entries quickly

  const LEVEL = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };

  const CATS = {
    INIT:     { level: LEVEL.INFO,     color: '#60a5fa', icon: '⬡' },
    NAV:      { level: LEVEL.INFO,     color: '#38bdf8', icon: '→' },
    NET:      { level: LEVEL.DEBUG,    color: '#818cf8', icon: '⇄' },
    SCROLL:   { level: LEVEL.DEBUG,    color: '#a78bfa', icon: '⇕' },
    SUBMIT:   { level: LEVEL.INFO,     color: '#fb923c', icon: '⬆' },
    DRAFT:    { level: LEVEL.INFO,     color: '#34d399', icon: '💾' },
    MEDIA:    { level: LEVEL.DEBUG,    color: '#e879f9', icon: '🖼' },
    LATEX:    { level: LEVEL.DEBUG,    color: '#fbbf24', icon: 'Σ' },
    SUPABASE: { level: LEVEL.INFO,     color: '#f59e0b', icon: '☁' },
    PERF:     { level: LEVEL.DEBUG,    color: '#94a3b8', icon: '⏱' },
    WARN:     { level: LEVEL.WARN,     color: '#f59e0b', icon: '▲' },
    ERROR:    { level: LEVEL.ERROR,    color: '#f87171', icon: '✕' },
    CRITICAL: { level: LEVEL.CRITICAL, color: '#ff0000', icon: '☠' },
    INFO:     { level: LEVEL.INFO,     color: '#94a3b8', icon: 'ℹ' },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let _entries      = [];
  let _list         = null;
  let _paused       = false;
  let _filterLevel  = LEVEL.DEBUG;
  let _filterText   = '';
  let _persistTimer = null;
  const _sessionId    = _getOrCreateSession();
  const _sessionStart = Date.now();
  const _perfMarks    = {};

  // ── Safe storage ──────────────────────────────────────────────────────────
  const _storage = (function () {
    const _mem = {};
    try {
      localStorage.setItem('_bf_test', '1');
      localStorage.removeItem('_bf_test');
      return localStorage;
    } catch (e) {
      return {
        getItem:    function (k)    { return _mem[k] || null; },
        setItem:    function (k, v) { _mem[k] = v; },
        removeItem: function (k)    { delete _mem[k]; },
      };
    }
  }());

  // ── Session ID ─────────────────────────────────────────────────────────────
  // Always generate a fresh ID per page load — not persisted.
  // This ensures _loadPersistedLog() always restores previous entries
  // (session never matches stored session), and the log accumulates
  // across server restarts rather than being overwritten.
  function _getOrCreateSession() {
    return 'bf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  // ── Core entry ─────────────────────────────────────────────────────────────
  function _makeEntry(cat, msg, data) {
    const now     = new Date();
    const catMeta = CATS[cat] || CATS.INFO;
    return {
      ts:        now.toISOString(),
      ts_rel:    ((Date.now() - _sessionStart) / 1000).toFixed(3) + 's',
      session:   _sessionId,
      level:     catMeta.level,
      levelName: Object.keys(LEVEL).find(function (k) { return LEVEL[k] === catMeta.level; }) || 'INFO',
      cat:       cat,
      msg:       String(msg || ''),
      data:      data !== undefined ? data : null,
      page:      window.location.pathname.split('/').pop() || 'index',
      url:       window.location.pathname,
    };
  }

  /*
  ====================
  log

   Primary log function. Creates a structured entry, appends to the
   in-memory buffer, mirrors errors/criticals to native console,
   renders to the log-viewer panel if open, and persists to localStorage.
   cat:  category key from CATS (e.g. 'INFO', 'ERROR', 'NET')
   msg:  human-readable message string
   data: optional structured data object
  ====================
  */
  function log(cat, msg, data) {
    const entry   = _makeEntry(cat, msg, data);
    const catMeta = CATS[cat] || CATS.INFO;

    _entries.push(entry);
    if (_entries.length > MAX_ENTRIES) _entries.shift();

    // Mirror errors/criticals to native console
    if (catMeta.level >= LEVEL.ERROR) {
      console.error('[BFLog ' + cat + ']', msg, data || '');
    } else if (catMeta.level >= LEVEL.WARN) {
      console.warn('[BFLog ' + cat + ']', msg, data || '');
    }

    if (!_paused && _list) _renderEntry(entry, true);

    // Persist immediately on error, debounced otherwise
    if (catMeta.level >= LEVEL.ERROR) {
      _persistNow();
    } else {
      _schedulePersist();
    }

    return entry;
  }

  /*
  ====================
  perfStart / perfEnd

   Bracket a code section to measure elapsed time.
   perfStart records the high-resolution timestamp.
   perfEnd calculates the delta, logs it as a PERF entry, and returns ms.
  ====================
  */
  function perfStart(name) { _perfMarks[name] = performance.now(); }
  function perfEnd(name) {
    const start = _perfMarks[name];
    if (start === undefined) return;
    const ms = (performance.now() - start).toFixed(2);
    delete _perfMarks[name];
    log('PERF', name + ' took ' + ms + 'ms', { name: name, ms: parseFloat(ms) });
    return parseFloat(ms);
  }

  /*
  ====================
  info / warn / error

   Typed convenience wrappers around log(). Prepend source label to message.
   error() normalises Error objects into plain data for JSON serialisation.
  ====================
  */
  function info(source, msg, data)  { return log('INFO',     source + ': ' + msg, data); }
  function warn(source, msg, data)  { return log('WARN',     source + ': ' + msg, data); }
  function error(source, msg, data) {
    // Normalise Error objects
    if (data instanceof Error) {
      data = { message: data.message, stack: data.stack, name: data.name };
    }
    return log('ERROR', source + ': ' + msg, data);
  }

  /*
  ====================
  logNav / logSubmit / logDraft / logMedia / logSupabase

   Domain-specific typed loggers. Each routes to the correct category
   so the log-viewer can filter by icon and colour.
  ====================
  */
  function logNav(page)             { return log('NAV',      '→ ' + page, { page: page }); }
  function logSubmit(step, data)    { return log('SUBMIT',   step, data); }
  function logDraft(action, data)   { return log('DRAFT',    action, data); }
  function logMedia(action, data)   { return log('MEDIA',    action, data); }
  function logSupabase(action, data){ return log('SUPABASE', action, data); }

  /*
  ====================
  _hookNetwork

   Monkey-patches window.fetch to log all outbound requests and responses.
   Skips noisy URLs (livereload, favicon). Categorises Supabase calls.
   Logs timing, status, and slow-request warnings (>3000ms).
  ====================
  */
  function _hookNetwork() {
    if (typeof window.fetch !== 'function') return;
    const _origFetch = window.fetch;

    // URLs to skip — noise with no diagnostic value
    const SKIP_PATTERNS = [
      'livereload',           // Live Server WebSocket polling
      'localhost:35729',      // Live Server legacy port
      '127.0.0.1:35729',
      '/favicon',             // favicon requests
      'bf_debug_log',         // our own storage (not a network call, but guard)
    ];

    window.fetch = function(input, init) {
      const url    = typeof input === 'string' ? input : (input && input.url) || String(input);
      const method = (init && init.method) || (input && input.method) || 'GET';

      // Skip noise
      const skip = SKIP_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
      if (skip) return _origFetch.apply(this, arguments);

      const start   = performance.now();
      const shortUrl = url.length > 80 ? url.slice(0, 77) + '…' : url;

      // Categorise the request
      let cat = 'NET';
      if (url.indexOf('supabase.co') !== -1) cat = 'SUPABASE';

      log(cat, 'fetch → ' + method + ' ' + shortUrl, {
        method: method,
        url: url,
        body_bytes: (init && init.body) ? String(init.body).length : 0,
      });

      return _origFetch.apply(this, arguments).then(function(response) {
        const ms = Math.round(performance.now() - start);
        const level = response.ok ? cat : 'ERROR';
        log(level, 'fetch ← ' + response.status + ' ' + method + ' ' + shortUrl, {
          status:   response.status,
          ok:       response.ok,
          ms:       ms,
          url:      url,
          slow:     ms > 3000,
        });
        return response;
      }, function(err) {
        const ms = Math.round(performance.now() - start);
        log('ERROR', 'fetch ✕ ' + method + ' ' + shortUrl, {
          error:  err.message,
          ms:     ms,
          url:    url,
        });
        throw err;
      });
    };
  }

  /*
  ====================
  _hookGlobalErrors

   Captures unhandled errors, unhandled promise rejections, and
   intercepted console.error/warn calls from third-party libraries.
   All are logged as CRITICAL or ERROR entries with stack traces.
  ====================
  */
  function _hookGlobalErrors() {
    window.addEventListener('error', function (e) {
      log('CRITICAL', 'Unhandled error: ' + e.message, {
        message:  e.message,
        filename: e.filename ? e.filename.split('/').pop() : null,
        line:     e.lineno,
        col:      e.colno,
        stack:    e.error ? (e.error.stack || '').split('\n').slice(0, 6).join('\n') : null,
      });
    });

    window.addEventListener('unhandledrejection', function (e) {
      const reason = e.reason;
      log('CRITICAL', 'Unhandled promise rejection', {
        reason: String(reason),
        stack:  reason && reason.stack ? reason.stack.split('\n').slice(0, 6).join('\n') : null,
      });
    });

    // Intercept console.error so third-party libs are also caught
    const _origError = console.error;
    console.error = function () {
      const args = Array.prototype.slice.call(arguments);
      if (args[0] && String(args[0]).indexOf('[BFLog') === 0) {
        _origError.apply(console, args);
        return;
      }
      log('ERROR', args.map(function (a) { return a instanceof Error ? a.message : String(a); }).join(' '), {
        raw: args.map(String),
      });
      _origError.apply(console, args);
    };

    const _origWarn = console.warn;
    console.warn = function () {
      const args = Array.prototype.slice.call(arguments);
      if (args[0] && String(args[0]).indexOf('[BFLog') === 0) {
        _origWarn.apply(console, args);
        return;
      }
      log('WARN', args.map(String).join(' '));
      _origWarn.apply(console, args);
    };
  }

  /*
  ====================
  _persistNow

   Immediately write all in-memory entries to localStorage, merging
   with any entries from other browsing contexts. Caps at MAX_ENTRIES.
  ====================
  */
  function _persistNow() {
    try {
      // Merge with any entries already in storage from other browsing contexts
      const existing = _readStoredEntries();
      const myKeys   = new Set(_entries.map(function(e){ return e.ts + e.cat + e.msg; }));
      let merged   = existing.filter(function(e){
        return !myKeys.has(e.ts + e.cat + e.msg);
      }).concat(_entries).sort(function(a,b){ return a.ts < b.ts ? -1 : 1; });
      if (merged.length > MAX_ENTRIES) merged = merged.slice(-MAX_ENTRIES);
      _storage.setItem(PERSIST_KEY, JSON.stringify({
        v:       VERSION,
        session: _sessionId,
        saved:   new Date().toISOString(),
        entries: merged.slice(-300),
      }));
    } catch (e) {
      // Storage full — mirror to native console since BFLog.log would recurse
      console.warn('[BFLog] localStorage persist failed:', e.message);
    }
  }

  function _readStoredEntries() {
    try {
      const raw = _storage.getItem(PERSIST_KEY);
      if (!raw) return [];
      const payload = JSON.parse(raw);
      return Array.isArray(payload.entries) ? payload.entries : [];
    } catch (e) { return []; }
  }

  function _schedulePersist() {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(_persistNow, DEBOUNCE_MS);
  }

  function _loadPersistedLog() {
    try {
      const raw = _storage.getItem(PERSIST_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!Array.isArray(payload.entries) || !payload.entries.length) return;
      const myKeys = new Set(_entries.map(function(e){ return e.ts + e.cat + e.msg; }));
      const fresh  = payload.entries
        .filter(function(e){ return !myKeys.has(e.ts + e.cat + e.msg); })
        .map(function(e){ return Object.assign({}, e, { _restored: true }); });
      if (!fresh.length) return;
      _entries = fresh.concat(_entries);
      if (_entries.length > MAX_ENTRIES) _entries = _entries.slice(-MAX_ENTRIES);
    } catch (e) {
      console.warn('[BFLog] Corrupted persisted log — skipped:', e.message);
    }
  }

  /*
  ====================
  snapshot

   Capture all form field values on the current page. Logs them as an
   INFO entry and returns the field map. Useful for debugging form state.
  ====================
  */
  function snapshot() {
    const fields = {};
    document.querySelectorAll('input[id],select[id],textarea[id]').forEach(function (el) {
      if (el.value || el.checked) {
        fields[el.id] = el.type === 'checkbox' ? el.checked : el.value.slice(0, 200);
      }
    });
    log('INFO', 'Snapshot: ' + Object.keys(fields).length + ' fields', fields);
    return fields;
  }

  /*
  ====================
  exportLog

   Download all log entries as a file. Supports two formats:
   'ndjson' (default) — one JSON object per line, machine-readable.
   'text' — human-readable .log format with box-drawing header.
   Merges in-memory and localStorage entries before export.
  ====================
  */
  function exportLog(format) {
    format = format || 'ndjson';
    const stamp    = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const header   = {
      app:      'Brainfolds',
      version:  VERSION,
      session:  _sessionId,
      exported: new Date().toISOString(),
      path:     window.location.pathname,
      entries:  _entries.length,
    };

    let content, filename, type;

    let allEntries = _readStoredEntries();
    // Also include any in-memory entries not yet persisted
    const storedKeys2 = new Set(allEntries.map(function(e){ return e.ts + e.cat + e.msg; }));
    _entries.forEach(function(e){ if (!storedKeys2.has(e.ts + e.cat + e.msg)) allEntries.push(e); });
    allEntries.sort(function(a,b){ return a.ts < b.ts ? -1 : 1; });
    header.entries = allEntries.length;

    if (format === 'ndjson') {
      const lines = [JSON.stringify(header)];
      allEntries.forEach(function (e) { lines.push(JSON.stringify(e)); });
      content  = lines.join('\n');
      filename = 'brainfolds-' + stamp + '.ndjson';
      type     = 'application/x-ndjson';
    } else {
        const lines2 = [
        '╔══════════════════════════════════════════════════════',
        '║  Brainfolds — Debug Log',
        '║  Session:  ' + _sessionId,
        '║  Exported: ' + header.exported,
        '║  Path:     ' + header.path,
        '╚══════════════════════════════════════════════════════',
        '',
      ];
      allEntries.forEach(function (e) {
        lines2.push(
          '[' + e.ts_rel + '] [' + e.levelName + '] [' + e.cat + '] ' + e.msg +
          (e.data ? '\n  ' + JSON.stringify(e.data) : '')
        );
      });
      content  = lines2.join('\n');
      filename = 'brainfolds-' + stamp + '.log';
      type     = 'text/plain';
    }

    const blob = new Blob([content], { type: type });
    const a    = document.createElement('a');
    a.href   = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    log('INFO', 'Exported: ' + filename + ' (' + _entries.length + ' entries)');
  }

  // ── Panel rendering (used by log-viewer.html) ──────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _levelColor(level) {
    if (level >= LEVEL.CRITICAL) return '#ff0000';
    if (level >= LEVEL.ERROR)    return '#f87171';
    if (level >= LEVEL.WARN)     return '#f59e0b';
    return null;
  }

  function _formatTs(iso) {
    try {
      const d = new Date(iso);
      const p = function(n) { return String(n).padStart(2, '0'); };
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
             '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch(e) { return iso || ''; }
  }

  /*
  ====================
  _renderEntry

   Append a single log entry as a DOM row in the log-viewer panel.
   Uses createElement + textContent exclusively — no innerHTML with
   untrusted data (entry.msg can come from intercepted console.error).
   Applies level/category filtering and auto-scrolls to bottom.
  ====================
  */
  function _renderEntry(entry, scroll) {
    if (!_list) return;

    const catMeta = CATS[entry.cat] || CATS.INFO;
    if (catMeta.level < _filterLevel) return;

    // Hide INIT spam by default — toggled via window._bfHideInit
    if (entry.cat === 'INIT' &&
        typeof window._bfHideInit === 'function' && window._bfHideInit()) return;

    if (_filterText &&
        (entry.msg + JSON.stringify(entry.data || '')).toLowerCase().indexOf(_filterText) === -1) return;

    const row = document.createElement('div');
    row.className = 'bflog-row' + (entry._restored ? ' bflog-row--restored' : '');
    row.style.cursor = 'pointer';

    const bg = _levelColor(catMeta.level);
    if (bg) row.style.background = bg + '18';

    // Every row is clickable — shows full detail in the right pane
    row.addEventListener('click', function () {
      const det = document.getElementById('bflog-detail');
      if (det) {
        det.textContent =
          'Time:    ' + entry.ts + '\n' +
          'Session: ' + (entry.session || '—') + '\n' +
          'Cat:     ' + entry.cat + '\n' +
          'Page:    ' + (entry.page || '—') + '\n' +
          'Message: ' + entry.msg +
          (entry.data ? '\n\nData:\n' + JSON.stringify(entry.data, null, 2) : '');
      }
    });

    // Build row using DOM methods — no innerHTML with potentially untrusted data.
    // entry.msg can contain content from intercepted console.error calls,
    // which may include third-party strings. textContent is XSS-safe.
    const mkSpan = function (cls, text, color) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      if (color) s.style.color = color;
      return s;
    };

    row.appendChild( mkSpan('bflog-rel',  _formatTs(entry.ts)) );
    row.appendChild( mkSpan('bflog-icon', catMeta.icon, catMeta.color) );
    row.appendChild( mkSpan('bflog-cat',  entry.cat, catMeta.color) );
    row.appendChild( mkSpan('bflog-page', entry.page || '') );
    row.appendChild( mkSpan('bflog-msg',  entry.msg) );
    if (entry.data) {
      row.appendChild( mkSpan('bflog-peek', JSON.stringify(entry.data).slice(0, 80) + '…') );
    }

    _list.appendChild(row);
    while (_list.children.length > MAX_ENTRIES) _list.removeChild(_list.firstChild);

    // Pin to bottom if active
    if (scroll) {
      if (typeof window._bfPinBottom === 'function') window._bfPinBottom();
      else _list.scrollTop = _list.scrollHeight;
    }
  }

  function _updateStatus() {
    const el = document.getElementById('bflog-count');
    if (el) {
        const count = _readStoredEntries().length;
      el.textContent = count + ' entr' + (count === 1 ? 'y' : 'ies');
    }
  }

  function _rebuildList() {
    if (!_list) return;
    // Read ALL entries from localStorage so we pick up logs from every iframe/page
    let all = _readStoredEntries();
    // Also include any in-memory entries not yet persisted
    const storedKeys = new Set(all.map(function(e){ return e.ts + e.cat + e.msg; }));
    _entries.forEach(function(e){
      if (!storedKeys.has(e.ts + e.cat + e.msg)) all.push(e);
    });
    all.sort(function(a, b){ return a.ts < b.ts ? -1 : 1; });
    _list.innerHTML = '';
    all.forEach(function (e) { _renderEntry(e, false); });
    _list.scrollTop = _list.scrollHeight;
  }

  // ── Pull new entries from localStorage into the viewer ──────────────────────
  // Called by the storage event AND by the visibility/focus fallback poll.
  function _syncFromStorage() {
    if (_paused || !_list) return;
    const prev = _entries.length;
    _loadPersistedLog();
    if (_entries.length > prev) {
      // Append only new rows — don't rebuild everything (avoids flicker,
      // keeps expanded detail rows intact)
      _entries.slice(prev).forEach(function (entry) { _renderEntry(entry, true); });
      _updateStatus();
    }
  }

  // ── Storage event — fires in all alive same-origin tabs on localStorage write
  // Primary real-time update path. Latency typically <50ms.
  window.addEventListener('storage', function (e) {
    if (e.key !== PERSIST_KEY) return;
    _syncFromStorage();
  });

  // ── Visibility / focus fallback ───────────────────────────────────────────
  // Chrome can discard inactive iframe content after ~40min idle.
  // When the viewer tab becomes visible again, sync immediately from storage
  // to catch everything that was logged while the iframe was discarded.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') _syncFromStorage();
  });
  window.addEventListener('focus', _syncFromStorage);
  window.addEventListener('pageshow', _syncFromStorage);

  // ── Fallback poll — only runs on the log-viewer page ─────────────────────
  // Catches the case where storage events are missed (discarded context,
  // same-tab writes which don't fire storage events in the writing tab).
  // 3s interval is a good balance — fast enough to feel live, cheap enough
  // to not matter.
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('page-logger')) {
      setInterval(_syncFromStorage, 3000);
    }
  });

  /*
  ====================
  initPanel

   Called by log-viewer.html once its DOM is ready. Injects styles,
   wires up filter/search/export/clear buttons, loads persisted entries,
   and renders the initial log view.
  ====================
  */
  function initPanel() {
    const panel = document.getElementById('page-logger');
    if (!panel) return;

    // Inject styles
    if (!document.getElementById('bflog-styles')) {
        const css = document.createElement('style');
      css.id = 'bflog-styles';
      css.textContent = [
        '.bflog-btn{background:rgba(255,255,255,.05);border:1px solid #3A2814;',
        'color:#7A6040;border-radius:3px;padding:3px 10px;cursor:pointer;',
        'font-size:11px;font-family:"Courier New",monospace;white-space:nowrap;transition:all .12s;}',
        '.bflog-btn:hover{background:rgba(255,255,255,.1);color:#C8A878;border-color:#4E3820;}',
        '.bflog-btn.active{background:rgba(196,146,42,.12);color:#C4922A;border-color:#C4922A55;}',
        '.bflog-btn.danger:hover{border-color:#f87171;color:#f87171;}',
        '#bflog-search{background:#221608;border:1px solid #3A2814;color:#F5EDD8;',
        'border-radius:3px;padding:3px 10px;font-family:"Courier New",monospace;',
        'font-size:11px;width:140px;outline:none;}',
        '#bflog-search:focus{border-color:#C4922A55;}',
        '.bflog-row{padding:2px 12px;display:flex;gap:6px;align-items:baseline;',
        'line-height:1.7;border-bottom:1px solid #1A1208;font-family:"Courier New",monospace;font-size:11px;}',
        '.bflog-row:hover{background:rgba(255,255,255,.03);}',
        '.bflog-row--restored{opacity:.45;}',
        '.bflog-rel{color:#4A3820;flex-shrink:0;width:58px;font-size:10px;}',
        '.bflog-icon{flex-shrink:0;width:16px;text-align:center;}',
        '.bflog-cat{flex-shrink:0;width:72px;font-weight:700;font-size:10px;}',
        '.bflog-page{flex-shrink:0;width:90px;color:#4A3820;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.bflog-msg{color:#F5EDD8;flex:1;min-width:0;}',
        '.bflog-peek{color:#4A3820;font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      ].join('');
      document.head.appendChild(css);
    }

    _list = document.getElementById('bflog-list');
    const $ = function (id) { return document.getElementById(id); };

    if ($('bflog-snapshot'))       $('bflog-snapshot').onclick      = function () { snapshot(); _updateStatus(); };
    if ($('bflog-export-ndjson'))  $('bflog-export-ndjson').onclick = function () { exportLog('ndjson'); };
    if ($('bflog-export-log'))     $('bflog-export-log').onclick    = function () { exportLog('text'); };
    if ($('bflog-clear'))          $('bflog-clear').onclick         = function () {
      if (!confirm('Clear all logs from all pages?')) return;
      _entries = [];
      _storage.removeItem(PERSIST_KEY);
      if (_list) _list.innerHTML = '';
      const det = $('bflog-detail'); if (det) det.textContent = '← click a row with data to inspect';
      _updateStatus();
    };
    if ($('bflog-pause'))          $('bflog-pause').onclick         = function () {
      _paused = !_paused;
      this.textContent = _paused ? '▶ Resume' : '⏸ Pause';
      this.classList.toggle('active', _paused);
    };

    // Level filters
    document.querySelectorAll('.bflog-level-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _filterLevel = parseInt(this.dataset.lvl, 10);
        document.querySelectorAll('.bflog-level-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        _rebuildList();
        _updateStatus();
      });
    });

    // Search
    let _searchTimer;
    if ($('bflog-search')) {
      $('bflog-search').addEventListener('input', function () {
        clearTimeout(_searchTimer);
          const val = this.value;
        _searchTimer = setTimeout(function () {
          _filterText = val.toLowerCase();
          _rebuildList();
          _updateStatus();
        }, 200);
      });
    }

    // Load all persisted entries and render on open
    _loadPersistedLog();
    _rebuildList();
    _updateStatus();
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  _hookNetwork();
  _hookGlobalErrors();

  document.addEventListener('DOMContentLoaded', function () {
    log('INIT', 'DOMContentLoaded — session ' + _sessionId + ' — v' + VERSION);
    initPanel();
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    // Typed loggers
    info:        info,
    warn:        warn,
    error:       error,
    log:         log,
    logNav:      logNav,
    logSubmit:   logSubmit,
    logDraft:    logDraft,
    logMedia:    logMedia,
    logSupabase: logSupabase,
    // Performance
    perfStart:   perfStart,
    perfEnd:     perfEnd,
    // Utilities
    snapshot:    snapshot,
    exportLog:   exportLog,
    initPanel:   initPanel,
    // Accessors
    get entries()   { return _entries.slice(); },
    get sessionId() { return _sessionId; },
    get version()   { return VERSION; },
    LEVEL:          LEVEL,
    CATS:           CATS,
    STORAGE_KEY:    PERSIST_KEY,
    _persistNow:    _persistNow,  // exposed for beforeunload flush
  };

}());
