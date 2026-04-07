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

var BFLog = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var VERSION     = '1.0.0';
  var MAX_ENTRIES = 500;
  var PERSIST_KEY = 'bf_debug_log';
  var DEBOUNCE_MS = 500;   // short debounce so log-viewer picks up entries quickly

  var LEVEL = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };

  var CATS = {
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
  var _entries      = [];
  var _list         = null;
  var _paused       = false;
  var _filterLevel  = LEVEL.DEBUG;
  var _filterText   = '';
  var _persistTimer = null;
  var _sessionId    = _getOrCreateSession();
  var _sessionStart = Date.now();
  var _perfMarks    = {};

  // ── Safe storage ──────────────────────────────────────────────────────────
  var _storage = (function () {
    var _mem = {};
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
    var now     = new Date();
    var catMeta = CATS[cat] || CATS.INFO;
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

  // ── Primary log ───────────────────────────────────────────────────────────
  function log(cat, msg, data) {
    var entry   = _makeEntry(cat, msg, data);
    var catMeta = CATS[cat] || CATS.INFO;

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

  // ── Performance timing ─────────────────────────────────────────────────────
  function perfStart(name) { _perfMarks[name] = performance.now(); }
  function perfEnd(name) {
    var start = _perfMarks[name];
    if (start === undefined) return;
    var ms = (performance.now() - start).toFixed(2);
    delete _perfMarks[name];
    log('PERF', name + ' took ' + ms + 'ms', { name: name, ms: parseFloat(ms) });
    return parseFloat(ms);
  }

  // ── Typed helpers ──────────────────────────────────────────────────────────
  function info(source, msg, data)  { return log('INFO',     source + ': ' + msg, data); }
  function warn(source, msg, data)  { return log('WARN',     source + ': ' + msg, data); }
  function error(source, msg, data) {
    // Normalise Error objects
    if (data instanceof Error) {
      data = { message: data.message, stack: data.stack, name: data.name };
    }
    return log('ERROR', source + ': ' + msg, data);
  }
  function logNav(page)             { return log('NAV',      '→ ' + page, { page: page }); }
  function logSubmit(step, data)    { return log('SUBMIT',   step, data); }
  function logDraft(action, data)   { return log('DRAFT',    action, data); }
  function logMedia(action, data)   { return log('MEDIA',    action, data); }
  function logSupabase(action, data){ return log('SUPABASE', action, data); }

  // ── Network interceptor — patches window.fetch to log all requests ──────────
  function _hookNetwork() {
    if (typeof window.fetch !== 'function') return;
    var _origFetch = window.fetch;

    // URLs to skip — noise with no diagnostic value
    var SKIP_PATTERNS = [
      'livereload',           // Live Server WebSocket polling
      'localhost:35729',      // Live Server legacy port
      '127.0.0.1:35729',
      '/favicon',             // favicon requests
      'bf_debug_log',         // our own storage (not a network call, but guard)
    ];

    window.fetch = function(input, init) {
      var url    = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';

      // Skip noise
      var skip = SKIP_PATTERNS.some(function(p) { return url.indexOf(p) !== -1; });
      if (skip) return _origFetch.apply(this, arguments);

      var start   = performance.now();
      var shortUrl = url.length > 80 ? url.slice(0, 77) + '…' : url;

      // Categorise the request
      var cat = 'NET';
      if (url.indexOf('supabase.co') !== -1) cat = 'SUPABASE';

      log(cat, 'fetch → ' + method + ' ' + shortUrl, {
        method: method,
        url: url,
        body_bytes: (init && init.body) ? String(init.body).length : 0,
      });

      return _origFetch.apply(this, arguments).then(function(response) {
        var ms = Math.round(performance.now() - start);
        var level = response.ok ? cat : 'ERROR';
        log(level, 'fetch ← ' + response.status + ' ' + method + ' ' + shortUrl, {
          status:   response.status,
          ok:       response.ok,
          ms:       ms,
          url:      url,
          slow:     ms > 3000,
        });
        return response;
      }, function(err) {
        var ms = Math.round(performance.now() - start);
        log('ERROR', 'fetch ✕ ' + method + ' ' + shortUrl, {
          error:  err.message,
          ms:     ms,
          url:    url,
        });
        throw err;
      });
    };
  }

  // ── Global error capture ───────────────────────────────────────────────────
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
      var reason = e.reason;
      log('CRITICAL', 'Unhandled promise rejection', {
        reason: String(reason),
        stack:  reason && reason.stack ? reason.stack.split('\n').slice(0, 6).join('\n') : null,
      });
    });

    // Intercept console.error so third-party libs are also caught
    var _origError = console.error;
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args[0] && String(args[0]).indexOf('[BFLog') === 0) {
        _origError.apply(console, args);
        return;
      }
      log('ERROR', args.map(function (a) { return a instanceof Error ? a.message : String(a); }).join(' '), {
        raw: args.map(String),
      });
      _origError.apply(console, args);
    };

    var _origWarn = console.warn;
    console.warn = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args[0] && String(args[0]).indexOf('[BFLog') === 0) {
        _origWarn.apply(console, args);
        return;
      }
      log('WARN', args.map(String).join(' '));
      _origWarn.apply(console, args);
    };
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  function _persistNow() {
    try {
      // Merge with any entries already in storage from other browsing contexts
      var existing = _readStoredEntries();
      var myKeys   = new Set(_entries.map(function(e){ return e.ts + e.cat + e.msg; }));
      var merged   = existing.filter(function(e){
        return !myKeys.has(e.ts + e.cat + e.msg);
      }).concat(_entries).sort(function(a,b){ return a.ts < b.ts ? -1 : 1; });
      if (merged.length > MAX_ENTRIES) merged = merged.slice(-MAX_ENTRIES);
      _storage.setItem(PERSIST_KEY, JSON.stringify({
        v:       VERSION,
        session: _sessionId,
        saved:   new Date().toISOString(),
        entries: merged.slice(-300),
      }));
    } catch (e) { /* storage full */ }
  }

  function _readStoredEntries() {
    try {
      var raw = _storage.getItem(PERSIST_KEY);
      if (!raw) return [];
      var payload = JSON.parse(raw);
      return Array.isArray(payload.entries) ? payload.entries : [];
    } catch (e) { return []; }
  }

  function _schedulePersist() {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(_persistNow, DEBOUNCE_MS);
  }

  function _loadPersistedLog() {
    try {
      var raw = _storage.getItem(PERSIST_KEY);
      if (!raw) return;
      var payload = JSON.parse(raw);
      if (!Array.isArray(payload.entries) || !payload.entries.length) return;
      var myKeys = new Set(_entries.map(function(e){ return e.ts + e.cat + e.msg; }));
      var fresh  = payload.entries
        .filter(function(e){ return !myKeys.has(e.ts + e.cat + e.msg); })
        .map(function(e){ return Object.assign({}, e, { _restored: true }); });
      if (!fresh.length) return;
      _entries = fresh.concat(_entries);
      if (_entries.length > MAX_ENTRIES) _entries = _entries.slice(-MAX_ENTRIES);
    } catch (e) { /* corrupted storage — skip */ }
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────
  function snapshot() {
    var fields = {};
    document.querySelectorAll('input[id],select[id],textarea[id]').forEach(function (el) {
      if (el.value || el.checked) {
        fields[el.id] = el.type === 'checkbox' ? el.checked : el.value.slice(0, 200);
      }
    });
    log('INFO', 'Snapshot: ' + Object.keys(fields).length + ' fields', fields);
    return fields;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportLog(format) {
    format = format || 'ndjson';
    var stamp    = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    var header   = {
      app:      'Brainfolds',
      version:  VERSION,
      session:  _sessionId,
      exported: new Date().toISOString(),
      path:     window.location.pathname,
      entries:  _entries.length,
    };

    var content, filename, type;

    var allEntries = _readStoredEntries();
    // Also include any in-memory entries not yet persisted
    var storedKeys2 = new Set(allEntries.map(function(e){ return e.ts + e.cat + e.msg; }));
    _entries.forEach(function(e){ if (!storedKeys2.has(e.ts + e.cat + e.msg)) allEntries.push(e); });
    allEntries.sort(function(a,b){ return a.ts < b.ts ? -1 : 1; });
    header.entries = allEntries.length;

    if (format === 'ndjson') {
      var lines = [JSON.stringify(header)];
      allEntries.forEach(function (e) { lines.push(JSON.stringify(e)); });
      content  = lines.join('\n');
      filename = 'brainfolds-' + stamp + '.ndjson';
      type     = 'application/x-ndjson';
    } else {
      var lines2 = [
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

    var blob = new Blob([content], { type: type });
    var a    = document.createElement('a');
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
      var d = new Date(iso);
      var p = function(n) { return String(n).padStart(2, '0'); };
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
             '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch(e) { return iso || ''; }
  }

  function _renderEntry(entry, scroll) {
    if (!_list) return;

    var catMeta = CATS[entry.cat] || CATS.INFO;
    if (catMeta.level < _filterLevel) return;

    // Hide INIT spam by default — toggled via window._bfHideInit
    if (entry.cat === 'INIT' &&
        typeof window._bfHideInit === 'function' && window._bfHideInit()) return;

    if (_filterText &&
        (entry.msg + JSON.stringify(entry.data || '')).toLowerCase().indexOf(_filterText) === -1) return;

    var row = document.createElement('div');
    row.className = 'bflog-row' + (entry._restored ? ' bflog-row--restored' : '');
    row.style.cursor = 'pointer';

    var bg = _levelColor(catMeta.level);
    if (bg) row.style.background = bg + '18';

    // Every row is clickable — shows full detail in the right pane
    row.addEventListener('click', function () {
      var det = document.getElementById('bflog-detail');
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

    row.innerHTML =
      '<span class="bflog-rel">'  + _esc(_formatTs(entry.ts)) + '</span>' +
      '<span class="bflog-icon" style="color:' + catMeta.color + '">' + catMeta.icon + '</span>' +
      '<span class="bflog-cat"  style="color:' + catMeta.color + '">' + _esc(entry.cat) + '</span>' +
      '<span class="bflog-page">' + _esc(entry.page || '') + '</span>' +
      '<span class="bflog-msg">'  + _esc(entry.msg)  + '</span>' +
      (entry.data
        ? '<span class="bflog-peek">' + _esc(JSON.stringify(entry.data)).slice(0, 80) + '…</span>'
        : '');

    _list.appendChild(row);
    while (_list.children.length > MAX_ENTRIES) _list.removeChild(_list.firstChild);

    // Pin to bottom if active
    if (scroll) {
      if (typeof window._bfPinBottom === 'function') window._bfPinBottom();
      else _list.scrollTop = _list.scrollHeight;
    }
  }

  function _updateStatus() {
    var el = document.getElementById('bflog-count');
    if (el) {
      var count = _readStoredEntries().length;
      el.textContent = count + ' entr' + (count === 1 ? 'y' : 'ies');
    }
  }

  function _rebuildList() {
    if (!_list) return;
    // Read ALL entries from localStorage so we pick up logs from every iframe/page
    var all = _readStoredEntries();
    // Also include any in-memory entries not yet persisted
    var storedKeys = new Set(all.map(function(e){ return e.ts + e.cat + e.msg; }));
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
    var prev = _entries.length;
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

  // Called by log-viewer.html once its DOM is ready
  function initPanel() {
    var panel = document.getElementById('page-logger');
    if (!panel) return;

    // Inject styles
    if (!document.getElementById('bflog-styles')) {
      var css = document.createElement('style');
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
    var $ = function (id) { return document.getElementById(id); };

    if ($('bflog-snapshot'))       $('bflog-snapshot').onclick      = function () { snapshot(); _updateStatus(); };
    if ($('bflog-export-ndjson'))  $('bflog-export-ndjson').onclick = function () { exportLog('ndjson'); };
    if ($('bflog-export-log'))     $('bflog-export-log').onclick    = function () { exportLog('text'); };
    if ($('bflog-clear'))          $('bflog-clear').onclick         = function () {
      if (!confirm('Clear all logs from all pages?')) return;
      _entries = [];
      _storage.removeItem(PERSIST_KEY);
      if (_list) _list.innerHTML = '';
      var det = $('bflog-detail'); if (det) det.textContent = '← click a row with data to inspect';
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
    var _searchTimer;
    if ($('bflog-search')) {
      $('bflog-search').addEventListener('input', function () {
        clearTimeout(_searchTimer);
        var val = this.value;
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
