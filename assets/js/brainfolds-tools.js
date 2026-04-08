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

  /* ── Constants ────────────────────────────────────────────── */
  const TOOLS_FILENAME    = 'tools.json';
  const SECTION_PATTERN   = /^s\d{2}-/;
  const COURSE_PATTERN    = /^c\d{2}-/;
  const CURRICULUM_NAMES  = new Set( ['self-sufficiency', 'scholarium'] );

  /* ── Utilities ───────────────────────────────────────────── */

  /*
  ====================
  GetPageContext

   Derive curriculum, section, and course identifiers from the URL path.
   Returns { curriculum, section, course } — any may be null.
  ====================
  */
  function getPageContext() {
    const parts  = window.location.pathname.split( '/' ).filter( Boolean );
    const result = { curriculum: null, section: null, course: null };
    for ( const p of parts ) {
      if ( CURRICULUM_NAMES.has( p ) )    result.curriculum = p;
      if ( SECTION_PATTERN.test( p ) )    result.section    = p;
      if ( COURSE_PATTERN.test( p ) )     result.course     = p;
    }
    return result;
  }

  /*
  ====================
  EscHtml

   HTML-escape a string for safe insertion into the DOM via innerHTML.
  ====================
  */
  function escHtml( s ) {
    return String( s || '' )
      .replace( /&/g, '&amp;' )
      .replace( /</g, '&lt;' )
      .replace( />/g, '&gt;' )
      .replace( /"/g, '&quot;' )
      .replace( /'/g, '&#39;' );
  }

  /*
  ====================
  EscAttr

   Escape a string for use inside an HTML attribute value.
  ====================
  */
  function escAttr( s ) {
    return String( s || '' )
      .replace( /"/g, '&quot;' )
      .replace( /'/g, '&#39;' );
  }

  /*
  ====================
  RenderWidget

   Build the tools grid HTML and inject into the container.
   All dynamic strings are escaped before insertion.
  ====================
  */
  function renderWidget( tools, container ) {
    if ( !tools.length ) return;

    container.innerHTML = `
      <div class="bf-tools-section">
        <div class="bf-tools-header">
          <span class="bf-tools-icon">🔧</span>
          <h3 class="bf-tools-title">Recommended Tools</h3>
          <a class="bf-tools-all" href="/tools.html">All tools →</a>
        </div>
        <div class="bf-tools-grid">
          ${tools.map( tool => `
            <div class="bf-tool-card">
              <div class="bf-tool-top">
                <div class="bf-tool-name">${escHtml( tool.name )}</div>
                ${tool.price_range
                  ? `<span class="bf-tool-price">${escHtml( tool.price_range )}</span>`
                  : ''}
              </div>
              <div class="bf-tool-desc">${escHtml( tool.description )}</div>
              ${tool.why
                ? `<div class="bf-tool-why">${escHtml( tool.why )}</div>`
                : ''}
              ${tool.affiliate_url
                ? `<a class="bf-tool-link" href="${escAttr( tool.affiliate_url )}" target="_blank" rel="noopener sponsored">View →</a>`
                : ''}
            </div>
          ` ).join( '' )}
        </div>
        <p class="bf-tools-disclosure">
          Affiliate disclosure: links above may earn Brainfolds a small commission at no cost to you.
        </p>
      </div>
    `;
  }

  /*
  ====================
  Init

   Main entry point. Loads tools.json, filters for relevance, and renders.
  ====================
  */
  async function init() {
    const container = document.getElementById( 'bf-tools-widget' );
    if ( !container ) return;

    const ctx = getPageContext();
    if ( !ctx.curriculum ) return;

    try {
      const depth  = window.location.pathname.split( '/' ).filter( Boolean ).length;
      const prefix = depth <= 1 ? '/' : '../'.repeat( depth - 1 );
      const url    = prefix + TOOLS_FILENAME;

      const res = await fetch( url );
      if ( !res.ok ) {
        throw new Error( `tools.json fetch failed: ${res.status}` );
      }

      const data = await res.json();

      const relevant = ( data.tools || [] ).filter( tool => {
        if ( !tool.active ) return false;
        if ( tool.curriculum !== ctx.curriculum && tool.curriculum !== 'both' ) return false;
        if ( ctx.course  && tool.courses?.includes( ctx.course ) )   return true;
        if ( ctx.section && tool.sections?.includes( ctx.section ) ) return true;
        return false;
      });

      renderWidget( relevant, container );

    } catch ( err ) {
      if ( typeof BFLog !== 'undefined' ) {
        BFLog.warn( 'tools', 'Tools widget failed to load', err );
      }
    }
  }

  if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', init );
  } else {
    init();
  }
})();
