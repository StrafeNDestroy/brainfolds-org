/* ═══════════════════════════════════════════════════════════════
   FIRST PRINCIPLES — script.js
   ─────────────────────────────────────────────────────────────
   Written in modern JavaScript (ES2020+). Every pattern here is
   supported by all browsers released since 2020.

   Sections:
     1. Landing page  — stars + parallax
     2. Chapter nav   — scroll active tab into view
     3. Anchor links  — smooth scroll
     4. Quiz engine   — qTF, qSA, qGrade, qFIB, qFIBreset, qFIBreveal
     5. TOC sidebar   — collapsible, scroll-spy

   How this file is structured:
     Each section lives in its own block { ... }. Variables declared
     with const/let inside a block are private to that block — they
     cannot accidentally collide with variables in other sections.
     This is the modern replacement for the old IIFE pattern.

   Quiz functions are attached to window.* so that HTML onclick
   attributes can call them by name. Everything else is private.
   ═══════════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────────────────────
   1. LANDING PAGE — Stars + Parallax
   Only runs on pages that have a #stars element (the landing page).
   On every other page, getElementById returns null and nothing happens.
───────────────────────────────────────────────────────────── */
{
  const starsEl = document.getElementById('stars');

  if (starsEl) {
    // Generate 220 stars with randomised size, position, and timing.
    // CSS animation reads --dur, --delay, and --op as custom properties.
    for (let i = 0; i < 220; i++) {
      const s  = document.createElement('div');
      const sz = Math.random() < 0.08 ? 3 : Math.random() < 0.25 ? 2 : 1;
      s.className = 'star';
      s.style.cssText = [
        `left:${Math.random() * 100}%`,
        `top:${Math.random() * 72}%`,
        `width:${sz}px`,
        `height:${sz}px`,
        `--dur:${(2.5 + Math.random() * 4).toFixed(2)}s`,
        `--delay:-${(Math.random() * 6).toFixed(2)}s`,
        `--op:${(0.25 + Math.random() * 0.7).toFixed(2)}`,
      ].join(';');
      starsEl.appendChild(s);
    }

    // Parallax on scroll — throttled with requestAnimationFrame so it
    // runs at most once per frame rather than on every scroll event.
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      requestAnimationFrame(() => {
        const { scrollY } = window;
        const hero = document.querySelector('.hero');
        if (hero && scrollY < hero.offsetHeight * 1.2) {
          const treeline = document.querySelector('.treeline');
          const stars    = document.querySelector('.stars');
          if (treeline) treeline.style.transform = `translateY(${scrollY * 0.28}px)`;
          if (stars)    stars.style.transform    = `translateY(${scrollY * 0.12}px)`;
        }
        ticking = false;
      });
      ticking = true;
    }, { passive: true });
  }
}


/* ─────────────────────────────────────────────────────────────
   2. CHAPTER NAV — Scroll active tab into view on page load
   On mobile the chapter tab strip overflows horizontally. This
   ensures the active tab (the current chapter) is always visible
   when the page loads rather than scrolled off to the right.
───────────────────────────────────────────────────────────── */
{
  const nav    = document.querySelector('.chapter-nav-inner');
  const active = nav?.querySelector('.active');
  active?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
}


/* ─────────────────────────────────────────────────────────────
   3. ANCHOR LINKS — Smooth scroll for in-page #hash links
   Intercepts clicks on links like href="#4-2-external-stem-features"
   and scrolls smoothly instead of jumping. The TOC sidebar uses
   its own scroll handler (section 5) for the same reason.
───────────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id     = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});


/* ─────────────────────────────────────────────────────────────
   4. QUIZ ENGINE
   ─────────────────────────────────────────────────────────────
   All six functions are attached to window so HTML onclick
   attributes can reach them. Answer data lives in those onclick
   attributes — nothing is stored on the server or sent anywhere.
   The quiz works completely offline.

   score   — running correct-answer count for this page load
   done    — tracks which questions have been answered (prevents
             re-answering after the answer is revealed)
───────────────────────────────────────────────────────────── */
{
  'use strict';

  let score     = 0;
  const done    = {};

  // Normalise a string for fuzzy fill-in-the-blank matching:
  // strip punctuation, lowercase, collapse whitespace.
  const norm = str =>
    str.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

  // Update the score display and progress bar fill.
  const updateScore = () => {
    const scoreEl   = document.getElementById('qz-score');
    const summaryEl = document.getElementById('qz-summary');
    const fillEl    = document.getElementById('qz-fill');
    if (!scoreEl) return;

    const [, totalStr] = scoreEl.textContent.split('/');
    const total = parseInt(totalStr, 10) || 0;
    const pct   = total > 0 ? (score / total) * 100 : 0;

    if (fillEl)    fillEl.style.width    = `${pct}%`;
    scoreEl.textContent   = `${score} / ${total}`;
    if (summaryEl) summaryEl.textContent = `${score} / ${total}`;
  };

  // ── True / False ──────────────────────────────────────────
  // id:  question id, e.g. "tf3"
  // val: the button the user clicked ("T" or "F")
  // ans: array of correct answers for all TF questions on page
  // btn: the button DOM element (so we can find its siblings)
  window.qTF = (id, val, ans, btn) => {
    if (done[id]) return;

    const idx     = parseInt(id.replace('tf', ''), 10);
    const correct = ans[idx];
    const ok      = val === correct;

    // Disable both buttons and colour them correct/wrong
    btn.parentNode.querySelectorAll('.quiz-btn-tf').forEach(b => {
      b.disabled = true;
      b.classList.add(b.dataset.val === correct ? 'quiz-btn-correct' : 'quiz-btn-wrong');
    });

    const fb = document.getElementById(`fb-${id}`);
    if (fb) {
      fb.textContent = ok
        ? '✓ Correct!'
        : `✗ The answer is ${correct === 'T' ? 'True' : 'False'}.`;
      fb.className = `quiz-fb ${ok ? 'quiz-fb-correct' : 'quiz-fb-wrong'}`;
    }

    if (ok) score++;
    done[id] = true;
    updateScore();
  };

  // ── Short Answer ──────────────────────────────────────────
  // Shows the model answer and self-grade buttons (Got it / Partial / Missed).
  window.qSA = (id, btn) => {
    if (done[id]) return;

    const ta = document.getElementById(`ta-${id}`);
    if (!ta?.value.trim()) { ta?.focus(); return; }

    ta.disabled       = true;
    btn.style.display = 'none';

    document.getElementById(`ar-${id}`)?.style.setProperty('display', 'block');

    const fb = document.getElementById(`fb-${id}`);
    if (fb) {
      fb.className = 'quiz-fb quiz-fb-check';

      // Build self-grade UI via DOM (avoids innerHTML with dynamic id interpolation)
      fb.textContent = '';
      const prompt = document.createTextNode('How did you do? ');
      const sg     = document.createElement('span');
      sg.className = 'quiz-selfgrade';

      const mkBtn = (cls, label, ok) => {
        const b = document.createElement('button');
        b.className = `quiz-sg ${cls}`;
        b.textContent = label;
        b.addEventListener('click', () => qGrade(id, ok, b));
        return b;
      };

      sg.append(
        mkBtn('quiz-sg-good', '✔ Got it',  1),
        mkBtn('quiz-sg-part', '~ Partial', 0),
        mkBtn('quiz-sg-miss', '✘ Missed',  0),
      );
      fb.append(prompt, sg);
    }
    done[id] = 'p';
  };

  // ── Short Answer self-grade ───────────────────────────────
  window.qGrade = (id, ok, btn) => {
    btn.parentNode.querySelectorAll('.quiz-sg').forEach(b => { b.disabled = true; });
    if (ok) score++;
    done[id] = true;
    updateScore();
  };

  // ── Fill in the Blank ────────────────────────────────────
  // Accepts partial matches: user answer just needs to contain (or
  // be contained in) the correct answer when both are > 4 chars.
  // Multiple accepted answers are separated by / | or "or".
  window.qFIB = (id, ans, inp) => {
    if (done[id]) return;
    if (!inp?.value.trim()) { inp?.focus(); return; }

    const user     = norm(inp.value);
    const variants = ans.split(/[/|]|\bor\b/i).map(norm).filter(Boolean);
    const ok       = variants.some(v =>
      user === v || (v.length > 4 && (user.includes(v) || v.includes(user)))
    );

    const fb = document.getElementById(`fb-${id}`);

    if (ok) {
      inp.disabled = true;
      inp.classList.add('quiz-blank-correct');
      inp.closest('.quiz-q')
        ?.querySelectorAll('.quiz-btn-try,.quiz-btn-reveal,.quiz-btn-check')
        .forEach(b => { b.style.display = 'none'; });
      if (fb) { fb.textContent = '✓ Correct!'; fb.className = 'quiz-fb quiz-fb-correct'; }
      score++;
      done[id] = true;
      updateScore();
    } else {
      inp.classList.add('quiz-blank-wrong');
      if (fb) { fb.textContent = '✗ Not quite — try again.'; fb.className = 'quiz-fb quiz-fb-wrong'; }
      document.getElementById(`try-${id}`)?.style.setProperty('display', 'inline-block');
      setTimeout(() => inp.classList.remove('quiz-blank-wrong'), 700);
    }
  };

  // ── Fill in the Blank — reset ─────────────────────────────
  window.qFIBreset = id => {
    const inp = document.getElementById(`blank-${id}`);
    const fb  = document.getElementById(`fb-${id}`);
    if (inp) { inp.value = ''; inp.focus(); }
    if (fb)  { fb.textContent = ''; fb.className = 'quiz-fb'; }
    document.getElementById(`try-${id}`)?.style.setProperty('display', 'none');
  };

  // ── Fill in the Blank — reveal answer ────────────────────
  window.qFIBreveal = (id, ans) => {
    if (done[id]) return;
    const fb = document.getElementById(`fb-${id}`);
    if (fb) { fb.textContent = `Answer: ${ans}`; fb.className = 'quiz-fb quiz-fb-check'; }
    done[id] = true;
    updateScore();
  };
}


/* ─────────────────────────────────────────────────────────────
   5. TOC SIDEBAR
   ─────────────────────────────────────────────────────────────
   Two-section layout (static-site constraint: only the current
   page's H2 sections are available at runtime — other chapters
   cannot be read without a server fetch).

   Section 1 — "This Chapter"
     Lists the H2 sections of the current page.
     Scroll-spy highlights the active section as you read.

   Section 2 — "Chapters"
     Lists every chapter in the curriculum.
     Current chapter is greyed out with aria-current="page".
     Every other chapter is a plain link that navigates there.

   Only runs on pages that have a #toc-sidebar element.
───────────────────────────────────────────────────────────── */
{
  const sidebar = document.getElementById('toc-sidebar');

  if (sidebar) {
    const toggle      = document.getElementById('toc-toggle');
    const toggleArrow = document.getElementById('toc-toggle-arrow');
    const panel       = document.getElementById('toc-panel');

    if (toggle && panel) {

      // H2 ids to skip — structural end-of-chapter sections.
      const SKIP = new Set([
        'chapter-summary',
        'practice-exercises',
        'connections-to-other-topics',
      ]);

      // Collect this page's H2 sections.
      const allH2s = Array.from(document.querySelectorAll('.toc-main h2'));
      const sectionItems = allH2s
        .filter(h => h.id && !SKIP.has(h.id))
        .map(({ id, textContent }) => ({ id, text: textContent.trim() }));

      // Log TOC build result — helps diagnose broken TOC navigation
      if (typeof BFLog !== 'undefined') {
        const noId    = allH2s.filter(h => !h.id).map(h => h.textContent.trim().slice(0, 40));
        const skipped = allH2s.filter(h => h.id && SKIP.has(h.id)).map(h => h.id);
        BFLog.log(sectionItems.length === 0 ? 'WARN' : 'INFO',
          'TOC built — ' + sectionItems.length + ' section' + (sectionItems.length !== 1 ? 's' : ''), {
          total_h2s:      allH2s.length,
          in_toc:         sectionItems.length,
          skipped_ids:    skipped,
          missing_id:     noId,
          ids:            sectionItems.map(s => s.id),
          page:           location.pathname.split('/').pop(),
        });
      }

      // ── Build two-section panel from scratch ─────────────
      while (panel.firstChild) panel.removeChild(panel.firstChild);

      // ── SECTION 1: This Chapter ───────────────────────────
      if (sectionItems.length) {
        const s1btn = document.createElement('button');
        s1btn.className   = 'toc-section-label toc-section-toggle';
        s1btn.setAttribute('aria-expanded', 'true');
        s1btn.setAttribute('aria-controls', 'toc-section-links');

        const s1text  = document.createElement('span');
        s1text.textContent = 'This Chapter';

        const s1arrow = document.createElement('span');
        s1arrow.className   = 'toc-section-arrow';
        s1arrow.textContent = '▲';
        s1arrow.setAttribute('aria-hidden', 'true');

        s1btn.appendChild(s1text);
        s1btn.appendChild(s1arrow);
        panel.appendChild(s1btn);

        const secList = document.createElement('ul');
        secList.className = 'toc-section-links';
        secList.id        = 'toc-section-links';

        // Section H2 links
        sectionItems.forEach(({ id, text }) => {
          const li = document.createElement('li');
          const a  = document.createElement('a');
          a.href           = `#${id}`;
          a.textContent    = text;
          a.dataset.target = id;
          li.appendChild(a);
          secList.appendChild(li);
        });

        // End-of-chapter links inside the same collapsible
        const endSep = document.createElement('li');
        endSep.className = 'toc-end-sep';
        secList.appendChild(endSep);

        const endLinks = [
          { href: '#quiz',                        text: '📝 Interactive Quiz' },
          { href: '#exercises',                   text: '🌱 Practical Exercises' },
          { href: '#connections-to-other-topics', text: '🔗 Connections' },
          { href: '#resources',                   text: '📚 Resources' },
        ];

        endLinks.forEach(({ href, text }) => {
          const li = document.createElement('li');
          const a  = document.createElement('a');
          a.href        = href;
          a.textContent = text;
          a.className   = 'toc-end-link';
          li.appendChild(a);
          secList.appendChild(li);
        });

        panel.appendChild(secList);

        // Toggle collapse/expand
        let secOpen = true;
        s1btn.addEventListener('click', () => {
          secOpen = !secOpen;
          secList.classList.toggle('toc-section-collapsed', !secOpen);
          s1arrow.textContent = secOpen ? '▲' : '▼';
          s1btn.setAttribute('aria-expanded', String(secOpen));
        });
      }

      // ── Divider ───────────────────────────────────────────
      const divider = document.createElement('div');
      divider.className = 'toc-divider';
      panel.appendChild(divider);

      // ── SECTION 2: All Chapters ───────────────────────────
      const s2label = document.createElement('div');
      s2label.className   = 'toc-section-label';
      s2label.textContent = 'Chapters';
      panel.appendChild(s2label);

      const chapList = document.createElement('ul');
      chapList.className = 'toc-chapter-links';

      document.querySelectorAll('.chapter-nav-inner a').forEach(navA => {
        const isCurrent = navA.classList.contains('active');
        const num        = navA.textContent.trim();
        const title      = navA.dataset.title ?? num;

        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.href        = navA.href;
        a.textContent = `${num} — ${title}`;
        if (isCurrent) {
          a.className = 'toc-chapter-current';
          a.setAttribute('aria-current', 'page');
        }
        li.appendChild(a);
        chapList.appendChild(li);
      });

      panel.appendChild(chapList);



      // ── Contents toggle (collapses whole panel) ───────────
      let panelOpen = true;
      toggleArrow?.classList.add('open');
      toggle.addEventListener('click', () => {
        panelOpen = !panelOpen;
        panel.classList.toggle('collapsed', !panelOpen);
        toggleArrow?.classList.toggle('open', panelOpen);
        toggle.setAttribute('aria-expanded', String(panelOpen));
      });

      // ── Smooth scroll on section link click ──────────────
      panel.addEventListener('click', e => {
        const a = e.target.closest('a[data-target]');
        if (!a) return;
        e.preventDefault();
        const target = document.getElementById(a.dataset.target);
        if (!target) return;
        // Use scrollIntoView for smooth scroll, but account for sticky header
        // by scrolling to slightly above the element using window.scrollTo
        const top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
      });

      // ── Scroll-spy — highlight active section ────────────
      const sectionLinks = Array.from(
        panel.querySelectorAll('a[data-target]')
      );

      if (sectionLinks.length) {
        const getActive = () => {
          const threshold = window.scrollY + 160;
          return sectionLinks.findLast(a => {
            const el = document.getElementById(a.dataset.target);
            return el && el.getBoundingClientRect().top + window.scrollY <= threshold;
          }) ?? sectionLinks[0];
        };

        const markActive = () => {
          const act = getActive();
          sectionLinks.forEach(a => a.classList.remove('toc-active'));
          act?.classList.add('toc-active');
          // Scroll the active link into view within the sidebar only.
          // Use scrollTop directly to avoid affecting window scroll position.
          if (act) {
            const sidebar = document.getElementById('toc-sidebar');
            if (sidebar) {
              const linkTop    = act.offsetTop;
              const linkBottom = linkTop + act.offsetHeight;
              const sideTop    = sidebar.scrollTop;
              const sideBottom = sideTop + sidebar.clientHeight;
              if (linkTop < sideTop || linkBottom > sideBottom) {
                sidebar.scrollTop = linkTop - sidebar.clientHeight / 2;
              }
            }
          }
        };

        let ticking = false;
        let _lastBoundary = 0; // throttle boundary logs to once per second
        window.addEventListener('scroll', () => {
          if (ticking) return;
          requestAnimationFrame(() => { markActive(); ticking = false; });
          ticking = true;

          // Log when scroll hits document boundary — these are the conditions
          // that can trigger browser back/forward navigation via overscroll.
          if (typeof BFLog !== 'undefined') {
            const el     = document.scrollingElement || document.documentElement;
            const atTop  = el.scrollTop <= 0;
            const atBot  = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
            const now    = Date.now();
            if ((atTop || atBot) && now - _lastBoundary > 1000) {
              _lastBoundary = now;
              BFLog.log('SCROLL', 'page hit scroll boundary', {
                boundary:     atTop ? 'top' : 'bottom',
                scrollTop:    el.scrollTop,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                page:         window.location.pathname.split('/').pop(),
                inIframe:     window.self !== window.top,
              });
            }
          }
        }, { passive: true });

        markActive();
      }

    } // end if (toggle && panel)
  }
}

/* ── PERFORMANCE & LAYOUT TRACKING ────────────────────────────────────────────
   Tracks layout shifts (CLS), long tasks, redirects, and navigation type.
   Only runs when BFLog is available. Captures flicker and redirect causes.
───────────────────────────────────────────────────────────────────────────── */
if (typeof BFLog !== 'undefined') {
  // Cumulative Layout Shift — visual flicker/jump events
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => {
        if (e.value > 0.01) {
          BFLog.log('PERF', 'layout shift — score ' + e.value.toFixed(4), {
            score:    e.value,
            sources:  (e.sources || []).map(s => ({
              node:    s.node ? s.node.tagName + (s.node.id ? '#'+s.node.id : '') : '?',
              top:     s.currentRect ? Math.round(s.currentRect.top) + 'px' : '?',
            })),
            page:     location.pathname.split('/').pop(),
            inIframe: window.self !== window.top,
          });
        }
      });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch(e) {}

  // Long tasks >50ms — causes of visible jank/freeze
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(e => {
        BFLog.log('PERF', 'long task — ' + Math.round(e.duration) + 'ms', {
          duration_ms: Math.round(e.duration),
          start_ms:    Math.round(e.startTime),
          page:        location.pathname.split('/').pop(),
          inIframe:    window.self !== window.top,
        });
      });
    }).observe({ type: 'longtask', buffered: true });
  } catch(e) {}

  // Navigation type — was this page a redirect, back/forward, or normal?
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      BFLog.log('NAV', 'page load — type:' + nav.type, {
        type:          nav.type,
        redirectCount: nav.redirectCount,
        duration_ms:   Math.round(nav.duration),
        page:          location.pathname.split('/').pop(),
        inIframe:      window.self !== window.top,
      });
      if (nav.redirectCount > 0) {
        BFLog.log('WARN', 'redirect detected — ' + nav.redirectCount + ' hop(s)', {
          page: location.pathname.split('/').pop(),
          redirectCount: nav.redirectCount,
          inIframe: window.self !== window.top,
        });
      }
    }
  } catch(e) {}

  // Scroll restoration type — did browser restore position or reset to top?
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && (nav.type === 'back_forward' || nav.type === 'reload')) {
      BFLog.log('NAV', 'scroll restoration — ' + (history.scrollRestoration || 'auto'), {
        navType:          nav.type,
        scrollRestoration: history.scrollRestoration,
        scrollY:          window.scrollY,
        page:             location.pathname.split('/').pop(),
      });
    }
  } catch(e) {}

  // localStorage quota and availability check
  try {
    const testKey = '_bf_quota_test';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    // Estimate usage
    let used = 0;
    for (let k in localStorage) {
      if (localStorage.hasOwnProperty(k)) used += (localStorage[k].length + k.length) * 2;
    }
    const usedKB = Math.round(used / 1024);
    if (usedKB > 2048) {
      BFLog.log('WARN', 'localStorage usage high — ' + usedKB + ' KB', {
        usedKB, page: location.pathname.split('/').pop(),
      });
    }
  } catch(e) {
    BFLog.log('WARN', 'localStorage unavailable — logger using in-memory fallback', {
      reason: e.message, page: location.pathname.split('/').pop(),
    });
  }

  // Chapter page asset completeness check
  const isChapterPage = document.querySelector('.toc-sidebar') !== null;
  if (isChapterPage) {
    const checks = {
      styleLoaded:    Array.from(document.styleSheets).some(s => s.href && s.href.includes('style.css')),
      quizPanel:      !!document.querySelector('.quiz-panel'),
      tocSidebar:     !!document.querySelector('.toc-sidebar'),
      katexLoaded:    typeof window.katex !== 'undefined',
      markedLoaded:   typeof window.marked !== 'undefined',
    };
    const missing = Object.keys(checks).filter(k => !checks[k]);
    BFLog.log(missing.length ? 'WARN' : 'INFO',
      'chapter assets — ' + (missing.length ? 'MISSING: ' + missing.join(', ') : 'all ok'), {
      ...checks,
      page: location.pathname.split('/').pop(),
    });
  }
}

/* ── DEV BUTTON — localhost only ──────────────────────────────────────────────
   Shows a small floating button linking back to the dev workspace.
   Only renders on localhost / 127.0.0.1 — invisible on the live site.
───────────────────────────────────────────────────────────────────────────── */
{
  const host = location.hostname;
  const inIframe = window.self !== window.top;
  if ((host === 'localhost' || host === '127.0.0.1') && !inIframe) {
    const btn = document.createElement('a');

    // dev.html lives at site/dev.html — served at /dev.html by Live Server
    btn.href = '/build/dev.html';

    btn.title = 'Open dev workspace';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <path d="M2 4l4 4-4 4M8 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    DEV`;

    // Position below the sticky header (header is ~48px tall at 14px padding top+bottom)
    // Bottom-right so it never overlaps nav links or chapter nav tabs
    Object.assign(btn.style, {
      position:       'fixed',
      bottom:         '56px',
      right:          '16px',
      zIndex:         '99',           // below header (z:100) and modals — not on top of navigation
      display:        'flex',
      alignItems:     'center',
      gap:            '6px',
      padding:        '5px 10px',
      background:     'rgba(26,18,8,0.85)',
      color:          '#C4922A',
      fontFamily:     "'JetBrains Mono', monospace",
      fontSize:       '0.6rem',
      fontWeight:     '700',
      letterSpacing:  '0.1em',
      textTransform:  'uppercase',
      textDecoration: 'none',
      borderRadius:   '4px',
      border:         '1px solid rgba(196,146,42,0.3)',
      boxShadow:      '0 2px 8px rgba(0,0,0,0.4)',
      opacity:        '0.5',
      transition:     'opacity 0.15s',
      pointerEvents:  'auto',
    });

    btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '0.85');

    document.body.appendChild(btn);
  }
}
