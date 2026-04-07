/**
 * brainfolds-tools.js
 * Loads tools.json and renders an inline tools widget on course/section pages.
 *
 * Usage: include this script on any page that should show relevant tools.
 * It looks for a <div id="bf-tools-widget"> element and renders into it.
 *
 * The widget filters tools by matching the current page's path against
 * tool.sections and tool.courses arrays.
 */

(function () {
  'use strict';

  // Derive context from URL path
  // e.g. /self-sufficiency/s01-foundation/c03-soil-science/index.html
  function getPageContext() {
    const parts  = window.location.pathname.split('/').filter(Boolean);
    const result = { curriculum: null, section: null, course: null };
    for (const p of parts) {
      if (p === 'self-sufficiency' || p === 'scholarium') result.curriculum = p;
      if (/^s\d{2}-/.test(p)) result.section = p;
      if (/^c\d{2}-/.test(p)) result.course = p;
    }
    return result;
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderWidget(tools, container) {
    if (!tools.length) return; // Nothing to show — widget stays hidden

    container.innerHTML = `
      <div class="bf-tools-section">
        <div class="bf-tools-header">
          <span class="bf-tools-icon">🔧</span>
          <h3 class="bf-tools-title">Recommended Tools</h3>
          <a class="bf-tools-all" href="/tools.html">All tools →</a>
        </div>
        <div class="bf-tools-grid">
          ${tools.map(tool => `
            <div class="bf-tool-card">
              <div class="bf-tool-top">
                <div class="bf-tool-name">${escHtml(tool.name)}</div>
                ${tool.price_range ? `<span class="bf-tool-price">${escHtml(tool.price_range)}</span>` : ''}
              </div>
              <div class="bf-tool-desc">${escHtml(tool.description)}</div>
              ${tool.why ? `<div class="bf-tool-why">${escHtml(tool.why)}</div>` : ''}
              ${tool.affiliate_url
                ? `<a class="bf-tool-link" href="${escAttr(tool.affiliate_url)}" target="_blank" rel="noopener sponsored">View →</a>`
                : ''}
            </div>
          `).join('')}
        </div>
        <p class="bf-tools-disclosure">
          Affiliate disclosure: links above may earn Brainfolds a small commission at no cost to you.
        </p>
      </div>
    `;
  }

  async function init() {
    const container = document.getElementById('bf-tools-widget');
    if (!container) return; // No widget placeholder on this page

    const ctx = getPageContext();
    if (!ctx.curriculum) return;

    try {
      // Depth-aware path to tools.json
      const depth = window.location.pathname.split('/').filter(Boolean).length;
      const prefix = depth <= 1 ? '/' : '../'.repeat(depth - 1);
      const url    = prefix + 'tools.json';

      const res  = await fetch(url);
      const data = await res.json();

      const relevant = (data.tools || []).filter(tool => {
        if (!tool.active) return false;
        if (tool.curriculum !== ctx.curriculum && tool.curriculum !== 'both') return false;
        if (ctx.course  && tool.courses?.includes(ctx.course))   return true;
        if (ctx.section && tool.sections?.includes(ctx.section)) return true;
        return false;
      });

      renderWidget(relevant, container);
    } catch (err) {
      BFLog.warn('tools', 'Tools widget failed to load', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
