/* ═══════════════════════════════════════════════════════════════
   BRAINFOLDS — brainfolds-reviews.js
   Review system + Video suggestion system
   Depends on: Supabase JS client (loaded via CDN in HTML)
   ═══════════════════════════════════════════════════════════════

   Sections:
     1. Config + Supabase client
     2. Utilities (page key, browser token, IP hash, star render)
     3. Review drawer — chapter rating + review feed
     4. Review footer badge — aggregate score shown at chapter bottom
     5. Index page aggregates — course/section score display
     6. Video system — approved videos + suggestion form
     7. Init — wire everything up on DOMContentLoaded
   ═══════════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────────────────────
   1. CONFIG + SUPABASE CLIENT
───────────────────────────────────────────────────────────── */
const BRAINFOLDS = (() => {

  const SUPABASE_URL = 'https://ekykcbmtmqzltkwhhxny.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_kUs7eM3cLtVCzJR6eBR4Qg_Fqo0k182';

  // Supabase JS client — loaded from CDN before this script
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);


  /* ───────────────────────────────────────────────────────────
     2. UTILITIES
  ─────────────────────────────────────────────────────────── */

  // Derive a stable page key from the URL path
  // e.g. /self-sufficiency/s01-foundation/c01-botany-basics/ch01.html
  //   →  self-sufficiency/s01/c01/ch01
  function getPageKey() {
    const path = window.location.pathname.replace(/\/index\.html$/, '/');
    const parts = path.split('/').filter(Boolean);

    // Map folder names to short keys
    const shorten = seg => {
      if (/^s\d+/.test(seg)) return seg.match(/^(s\d+)/)?.[1] ?? seg;
      if (/^c\d+/.test(seg)) return seg.match(/^(c\d+)/)?.[1] ?? seg;
      if (/^ch\d+/.test(seg)) return seg.replace('.html', '').match(/^(ch\d+)/)?.[1] ?? seg;
      return seg.replace('.html', '');
    };

    return parts.map(shorten).join('/');
  }

  // Persistent browser token — stored in localStorage
  // Used so visitors can edit/delete their own reviews
  function getBrowserToken() {
    let t = localStorage.getItem('bf_token');
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem('bf_token', t);
    }
    return t;
  }

  // One-way hash of IP address for rate limiting
  // We never store the raw IP — only a SHA-256 hash
  async function getIPHash() {
    try {
      const res  = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      const enc  = new TextEncoder().encode(data.ip + 'brainfolds-salt-2026');
      const hash = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback: hash a random value — won't rate-limit but won't break either
      return 'fallback-' + Math.random().toString(36).slice(2);
    }
  }

  // Render star string for a 1-10 rating
  // Uses filled/empty stars scaled to 10
  function renderStars(rating, max = 10) {
    const filled = Math.round(rating);
    return Array.from({ length: max }, (_, i) =>
      `<span class="bf-star ${i < filled ? 'bf-star-filled' : 'bf-star-empty'}">★</span>`
    ).join('');
  }

  // Format a timestamp to a readable relative date
  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  // Extract YouTube video ID from any YouTube URL format
  function extractYouTubeId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }


  /* ───────────────────────────────────────────────────────────
     3. REVIEW DRAWER
     Slide-in panel from the right with:
     - Aggregate score (large)
     - Paginated review feed (newest first)
     - Submission form (stars + optional name + text)
  ─────────────────────────────────────────────────────────── */

  function buildDrawer() {
    // Inject CSS

    // Build overlay + drawer DOM
    const overlay = document.createElement('div');
    overlay.className = 'bf-drawer-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const drawer = document.createElement('div');
    drawer.className = 'bf-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Chapter reviews');

    drawer.innerHTML = `
      <div class="bf-drawer-header">
        <div class="bf-drawer-score-wrap">
          <div>
            <span class="bf-drawer-score" id="bf-score">—</span>
            <span class="bf-drawer-score-max">/ 10</span>
          </div>
          <div class="bf-drawer-stars" id="bf-header-stars"></div>
          <div class="bf-drawer-count" id="bf-count">No reviews yet</div>
        </div>
        <button class="bf-drawer-close" id="bf-close" aria-label="Close reviews">✕</button>
      </div>
      <div class="bf-drawer-body" id="bf-drawer-body">

        <!-- Submit form -->
        <label class="bf-form-label">Rate this chapter</label>
        <div class="bf-star-picker" id="bf-star-picker" role="group" aria-label="Rating 1 to 10">
          ${Array.from({length:10},(_,i)=>`<span class="bf-star unselected" data-val="${i+1}" role="button" aria-label="${i+1} stars" tabindex="0">★</span>`).join('')}
        </div>
        <input class="bf-input" id="bf-name" type="text" placeholder="Your name (optional)" maxlength="20" autocomplete="off" />
        <textarea class="bf-textarea" id="bf-text" placeholder="Leave a review (optional)" maxlength="1000"></textarea>
        <button class="bf-submit-btn" id="bf-submit">Submit review</button>
        <div class="bf-form-msg" id="bf-msg"></div>

        <hr class="bf-divider">

        <!-- Review feed -->
        <div class="bf-reviews-title" id="bf-feed-title">Recent reviews</div>
        <div id="bf-feed"></div>
        <button class="bf-load-more" id="bf-load-more" style="display:none">Load more</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    return { overlay, drawer };
  }


  /* ───────────────────────────────────────────────────────────
     4. REVIEW FOOTER BADGE
  ─────────────────────────────────────────────────────────── */

  function buildFooterBadge(avg, count, scoreVisible = false) {
    const badge = document.createElement('div');
    badge.className  = 'bf-footer-badge';
    badge.id         = 'bf-footer-badge';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', `${scoreVisible ? avg + ' out of 10' : 'Ratings pending'} — open reviews`);

    const scoreText = scoreVisible ? avg.toFixed(1) : '—';
    const countText = count === 0
      ? 'Be the first to review'
      : count < 10
      ? `${count} rating${count === 1 ? '' : 's'} — score shows at 10`
      : count === 1 ? '1 review'
      : `${count} reviews`;

    badge.innerHTML = `
      <div class="bf-badge-score">${scoreText}<span> / 10</span></div>
      <div class="bf-badge-right">
        <div class="bf-badge-stars">${scoreVisible ? renderStars(avg) : '——————————'}</div>
        <div class="bf-badge-label">${countText}</div>
      </div>
      <div class="bf-badge-cta">Reviews →</div>
    `;
    return badge;
  }


  /* ───────────────────────────────────────────────────────────
     5. REVIEW SYSTEM — main logic
  ─────────────────────────────────────────────────────────── */

  async function initReviews() {
    if (!db) return;

    const pageKey      = getPageKey();
    const isChapter    = /\/ch\d+$/.test(pageKey);
    const chapterFooter = document.querySelector('.chapter-footer');

    if (!isChapter || !chapterFooter) return;

    // ── Fetch aggregate ───────────────────────────────────────
    // score_visible = true only when review_count >= 10 (bomb protection)
    let avg = 0, count = 0, scoreVisible = false;
    try {
      const { data } = await db
        .from('chapter_scores')
        .select('avg_rating, review_count, score_visible')
        .eq('page_key', pageKey)
        .single();
      if (data) {
        avg          = parseFloat(data.avg_rating);
        count        = parseInt(data.review_count);
        scoreVisible = data.score_visible === true;
      }
    } catch { /* no reviews yet */ }

    // ── Build footer badge ────────────────────────────────────
    const badge = buildFooterBadge(avg, count, scoreVisible);
    chapterFooter.insertAdjacentElement('beforebegin', badge);

    // ── Build drawer ──────────────────────────────────────────
    const { overlay, drawer } = buildDrawer();

    // Populate header
    const scoreEl       = drawer.querySelector('#bf-score');
    const headerStarsEl = drawer.querySelector('#bf-header-stars');
    const countEl       = drawer.querySelector('#bf-count');

    function updateHeader(a, c, visible) {
      scoreEl.textContent       = visible ? a.toFixed(1) : '—';
      headerStarsEl.innerHTML   = visible ? renderStars(a) : '';
      countEl.textContent       = c === 0 ? 'No reviews yet'
                                : c < 10  ? `${c} rating${c === 1 ? '' : 's'} — score shows at 10`
                                : c === 1 ? '1 review'
                                : `${c} reviews`;
    }
    updateHeader(avg, count, scoreVisible);

    // ── Open/close ────────────────────────────────────────────
    function openDrawer() {
      overlay.classList.add('open');
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
      drawer.querySelector('#bf-close').focus();
      loadFeed(0);
    }

    function closeDrawer() {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
      document.body.style.overflow = '';
      badge.focus();
    }

    badge.addEventListener('click', openDrawer);
    badge.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openDrawer(); });
    overlay.addEventListener('click', closeDrawer);
    drawer.querySelector('#bf-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // ── Star picker ───────────────────────────────────────────
    let selectedRating = 0;
    const picker = drawer.querySelector('#bf-star-picker');
    const stars  = picker.querySelectorAll('.bf-star');

    function setRating(val) {
      selectedRating = val;
      stars.forEach((s, i) => {
        s.classList.toggle('selected',   i < val);
        s.classList.toggle('unselected', i >= val);
      });
    }

    picker.addEventListener('mousemove', e => {
      const s = e.target.closest('.bf-star');
      if (!s) return;
      const hov = parseInt(s.dataset.val);
      stars.forEach((st, i) => {
        st.classList.toggle('selected',   i < hov);
        st.classList.toggle('unselected', i >= hov);
      });
    });

    picker.addEventListener('mouseleave', () => setRating(selectedRating));

    picker.addEventListener('click', e => {
      const s = e.target.closest('.bf-star');
      if (s) setRating(parseInt(s.dataset.val));
    });

    picker.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' && selectedRating < 10) setRating(selectedRating + 1);
      if (e.key === 'ArrowLeft'  && selectedRating > 1)  setRating(selectedRating - 1);
      if (e.key === 'Enter' && selectedRating > 0) drawer.querySelector('#bf-submit').click();
    });

    // ── Submit review ─────────────────────────────────────────
    const submitBtn = drawer.querySelector('#bf-submit');
    const msgEl     = drawer.querySelector('#bf-msg');

    submitBtn.addEventListener('click', async () => {
      if (selectedRating === 0) {
        showMsg('Please select a star rating first.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      try {
        const ipHash = await getIPHash();
        const token  = getBrowserToken();

        // Rate limit check
        const { data: limited } = await db.rpc('already_reviewed', {
          p_page_key: pageKey,
          p_ip_hash:  ipHash,
        });

        if (limited) {
          showMsg('You already reviewed this chapter in the last 24 hours.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit review';
          return;
        }

        const { error } = await db.from('reviews').insert({
          page_key:      pageKey,
          rating:        selectedRating,
          reviewer_name: drawer.querySelector('#bf-name').value.trim() || null,
          review_text:   drawer.querySelector('#bf-text').value.trim() || null,
          browser_token: token,
          ip_hash:       ipHash,
        });

        if (error) throw error;

        showMsg('Thank you — your review has been submitted.', 'success');
        drawer.querySelector('#bf-name').value = '';
        drawer.querySelector('#bf-text').value = '';
        setRating(0);
        loadFeed(0, true);

        // Refresh aggregate
        count++;
        avg = avg === 0
          ? selectedRating
          : parseFloat(((avg * (count - 1) + selectedRating) / count).toFixed(1));
        scoreVisible = count >= 10;
        updateHeader(avg, count, scoreVisible);

        // Update badge
        badge.querySelector('.bf-badge-score').innerHTML =
          `${scoreVisible ? avg.toFixed(1) : '—'}<span> / 10</span>`;
        badge.querySelector('.bf-badge-stars').innerHTML =
          scoreVisible ? renderStars(avg) : '——————————';
        badge.querySelector('.bf-badge-label').textContent =
          count < 10
          ? `${count} rating${count === 1 ? '' : 's'} — score shows at 10`
          : `${count} reviews`;

      } catch (err) {
        showMsg('Something went wrong. Please try again.', 'error');
        BFLog.error('reviews', 'Review fetch failed', err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit review';
      }
    });

    function showMsg(text, type) {
      msgEl.textContent  = text;
      msgEl.className    = `bf-form-msg ${type}`;
      setTimeout(() => { msgEl.className = 'bf-form-msg'; }, 5000);
    }

    // ── Review feed ───────────────────────────────────────────
    const feedEl    = drawer.querySelector('#bf-feed');
    const loadMoreBtn = drawer.querySelector('#bf-load-more');
    const PAGE_SIZE = 8;
    let   feedPage  = 0;
    let   allLoaded = false;

    async function loadFeed(page = 0, reset = false) {
      if (reset) { feedPage = 0; allLoaded = false; feedEl.innerHTML = ''; }

      try {
        const from = page * PAGE_SIZE;
        const { data, error } = await db
          .from('reviews')
          .select('rating, reviewer_name, review_text, created_at')
          .eq('page_key', pageKey)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        if (data.length === 0 && page === 0) {
          feedEl.innerHTML = '<p class="bf-reviews-empty">No reviews yet — be the first!</p>';
          loadMoreBtn.style.display = 'none';
          return;
        }

        data.forEach(r => {
          const item = document.createElement('div');
          item.className = 'bf-review-item';
          item.innerHTML = `
            <div class="bf-review-meta">
              <span class="bf-review-name">${r.reviewer_name ? escHtml(r.reviewer_name) : 'Anonymous'}</span>
              <span class="bf-review-rating">${renderStars(r.rating)}</span>
              <span class="bf-review-rating" style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:#C4922A;">${parseInt(r.rating, 10)}/10</span>
              <span class="bf-review-time">${timeAgo(r.created_at)}</span>
            </div>
            ${r.review_text ? `<p class="bf-review-text">${escHtml(r.review_text)}</p>` : ''}
          `;
          feedEl.appendChild(item);
        });

        allLoaded = data.length < PAGE_SIZE;
        loadMoreBtn.style.display = allLoaded ? 'none' : 'block';
        feedPage = page + 1;

      } catch (err) {
        feedEl.innerHTML = '<p class="bf-reviews-empty">Could not load reviews.</p>';
        BFLog.error('reviews', 'Review fetch failed', err);
      }
    }

    loadMoreBtn.addEventListener('click', () => loadFeed(feedPage));
  }


  /* ───────────────────────────────────────────────────────────
     5b. INDEX PAGE AGGREGATES
     Shows rolled-up scores on course/section index pages
  ─────────────────────────────────────────────────────────── */

  async function initIndexAggregates() {
    if (!db) return;

    const pageKey   = getPageKey();
    const isIndex   = window.location.pathname.endsWith('/') ||
                      window.location.pathname.endsWith('/index.html');
    if (!isIndex) return;

    // Find all curriculum cards and course cards on this page
    const cards = document.querySelectorAll('.curriculum-card, .chapter-card, .subject-card');
    if (!cards.length) return;

    // Fetch all relevant scores in one query
    try {
      const { data } = await db
        .from('course_scores')
        .select('course_key, avg_rating, review_count, score_visible');

      if (!data?.length) return;

      const scoreMap = {};
      data.forEach(row => { scoreMap[row.course_key] = row; });

      cards.forEach(card => {
        const href = card.getAttribute('href');
        if (!href) return;

        // Derive course key from the card's link
        const url     = new URL(href, window.location.href);
        const parts   = url.pathname.split('/').filter(Boolean);
        const shorten = seg => {
          if (/^s\d+/.test(seg)) return seg.match(/^(s\d+)/)?.[1] ?? seg;
          if (/^c\d+/.test(seg)) return seg.match(/^(c\d+)/)?.[1] ?? seg;
          return seg.replace('.html', '');
        };
        const courseKey = parts.map(shorten).join('/').replace(/\/index$/, '');
        const score     = scoreMap[courseKey];
        if (!score || !score.score_visible) return;

        const pill = document.createElement('span');
        pill.className = 'bf-score-pill';
        pill.title     = `${score.review_count} reviews`;
        pill.innerHTML = `<span class="bf-pill-star">★</span> ${parseFloat(score.avg_rating).toFixed(1)}<span style="color:#4A3820;font-size:0.6rem;">/10</span>`;

        const bottom = card.querySelector('.card-bottom');
        if (bottom) bottom.appendChild(pill);
        else card.appendChild(pill);
      });

    } catch (err) {
      BFLog.error('reviews', 'Aggregate fetch failed', err);
    }
  }


  /* ───────────────────────────────────────────────────────────
     6. VIDEO SYSTEM
     - Renders approved videos with ratings
     - Suggestion form for visitors
  ─────────────────────────────────────────────────────────── */

  async function initVideoSystem() {
    if (!db) return;

    const pageKey = getPageKey();
    const isChapter = /\/ch\d+$/.test(pageKey);
    if (!isChapter) return;

    const videoGrid = document.querySelector('.video-grid');
    const videoSection = document.querySelector('.video-section');
    if (!videoGrid || !videoSection) return;

    // ── Load approved videos ──────────────────────────────────
    try {
      const { data: videos } = await db
        .from('video_suggestions')
        .select('id, youtube_id, youtube_url, contributor_name, created_at')
        .eq('page_key', pageKey)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

      if (videos?.length) {
        // Fetch ratings for these videos
        const videoIds = videos.map(v => v.id);
        const { data: ratings } = await db
          .from('video_scores')
          .select('video_id, avg_rating, rating_count, score_visible')
          .in('video_id', videoIds);

        const ratingMap = {};
        ratings?.forEach(r => { ratingMap[r.video_id] = r; });

        // Clear placeholder cards
        videoGrid.innerHTML = '';

        videos.forEach(video => {
          const ytId    = video.youtube_id;
          const score   = ratingMap[video.id];
          const avgR    = score?.score_visible ? parseFloat(score.avg_rating) : 0;
          const rCount  = score ? parseInt(score.rating_count) : 0;
          const visible = score?.score_visible === true;
          const contrib = video.contributor_name || 'Anonymous';

          const card = document.createElement('div');
          card.className = 'video-card';
          card.dataset.videoId = video.id;
          card.innerHTML = `
            <div class="video-card-thumb">
              <iframe
                src="https://www.youtube-nocookie.com/embed/${ytId}?modestbranding=1&rel=0"
                title="Video by ${escHtml(contrib)}"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>
            <div class="video-card-info">
              <div class="video-card-title">Contributed by ${escHtml(contrib)}</div>
              <div class="video-card-source bf-video-rating-wrap">
                ${visible
                  ? `${renderStars(avgR)} <span style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:#C4922A;">${avgR.toFixed(1)}/10</span> <span style="color:#4A3820;font-size:0.6rem;">(${rCount})</span>`
                  : rCount === 0
                  ? '<span style="color:#4A3820;font-size:0.65rem;">No ratings yet</span>'
                  : `<span style="color:#4A3820;font-size:0.65rem;">${rCount} rating${rCount === 1 ? '' : 's'} — score shows at 10</span>`
                }
              </div>
              <div class="bf-video-rate-row" style="margin-top:8px;">
                <span style="font-family:'JetBrains Mono',monospace;font-size:0.62rem;color:#7A6040;letter-spacing:0.08em;">RATE: </span>
                <span class="bf-video-stars" data-video-id="${video.id}">
                  ${Array.from({length:10},(_,i)=>`<span class="bf-star bf-star-empty" data-val="${i+1}" style="cursor:pointer;font-size:0.9rem;">★</span>`).join('')}
                </span>
              </div>
            </div>
          `;
          videoGrid.appendChild(card);
        });

        // Wire up video star pickers
        videoGrid.querySelectorAll('.bf-video-stars').forEach(wrap => {
          const videoId = wrap.dataset.videoId;
          const vstars  = wrap.querySelectorAll('.bf-star');
          let   vRating = 0;

          wrap.addEventListener('mousemove', e => {
            const s = e.target.closest('.bf-star');
            if (!s) return;
            const hov = parseInt(s.dataset.val);
            vstars.forEach((st, i) => {
              st.className = `bf-star ${i < hov ? 'bf-star-filled' : 'bf-star-empty'}`;
            });
          });

          wrap.addEventListener('mouseleave', () => {
            vstars.forEach((st, i) => {
              st.className = `bf-star ${i < vRating ? 'bf-star-filled' : 'bf-star-empty'}`;
            });
          });

          wrap.addEventListener('click', async e => {
            const s = e.target.closest('.bf-star');
            if (!s) return;
            vRating = parseInt(s.dataset.val);
            vstars.forEach((st, i) => {
              st.className = `bf-star ${i < vRating ? 'bf-star-filled' : 'bf-star-empty'}`;
            });

            try {
              const ipHash = await getIPHash();
              await db.from('video_ratings').insert({
                video_id:      videoId,
                rating:        vRating,
                browser_token: getBrowserToken(),
                ip_hash:       ipHash,
              });
            } catch (err) {
              BFLog.error('video', 'Video rating failed', err);
            }
          });
        });
      }
    } catch (err) {
      BFLog.error('video', 'Video load failed', err);
    }

    // ── Suggestion form ───────────────────────────────────────
    const suggestionWrap = document.createElement('div');
    suggestionWrap.style.cssText = 'margin-top:24px;';
    suggestionWrap.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;letter-spacing:0.14em;text-transform:uppercase;color:#7A6040;margin-bottom:12px;">
        Suggest a video for this chapter
      </div>
      <input class="bf-input" id="bf-yt-url" type="url" placeholder="YouTube URL" />
      <input class="bf-input" id="bf-yt-name" type="text" placeholder="Your name (optional)" maxlength="20" />
      <textarea class="bf-textarea" id="bf-yt-reason" placeholder="Why does this video help? (optional)" maxlength="300" style="min-height:60px;"></textarea>
      <button class="bf-submit-btn" id="bf-yt-submit" style="background:#2A1C0C;color:#C4922A;border:1px solid #C4922A;">Suggest this video</button>
      <div class="bf-form-msg" id="bf-yt-msg"></div>
    `;
    videoSection.appendChild(suggestionWrap);

    // Inject input styles if not already there (they're in the review drawer styles)
    document.querySelector('#bf-yt-submit').addEventListener('click', async () => {
      const urlVal  = document.querySelector('#bf-yt-url').value.trim();
      const ytId    = extractYouTubeId(urlVal);
      const msgEl   = document.querySelector('#bf-yt-msg');
      const btn     = document.querySelector('#bf-yt-submit');

      // Validate it's a real https YouTube URL — reject javascript:, data:, etc.
      const isValidYouTubeUrl = ytId &&
        /^https:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(urlVal);

      if (!urlVal || !isValidYouTubeUrl) {
        msgEl.textContent = 'Please enter a valid YouTube URL (must start with https://).';
        msgEl.className   = 'bf-form-msg error';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const ipHash = await getIPHash();

        const { data: limited } = await db.rpc('already_suggested', {
          p_page_key: pageKey,
          p_ip_hash:  ipHash,
        });

        if (limited) {
          msgEl.textContent = 'You already suggested a video for this chapter today.';
          msgEl.className   = 'bf-form-msg error';
          btn.disabled = false;
          btn.textContent = 'Suggest this video';
          return;
        }

        const { error } = await db.from('video_suggestions').insert({
          page_key:         pageKey,
          youtube_url:      urlVal,
          youtube_id:       ytId,
          contributor_name: document.querySelector('#bf-yt-name').value.trim() || null,
          reason:           document.querySelector('#bf-yt-reason').value.trim() || null,
          status:           'pending',
          ip_hash:          ipHash,
        });

        if (error) throw error;

        msgEl.textContent = 'Thanks! Your suggestion is under review and will appear once approved.';
        msgEl.className   = 'bf-form-msg success';
        document.querySelector('#bf-yt-url').value    = '';
        document.querySelector('#bf-yt-name').value   = '';
        document.querySelector('#bf-yt-reason').value = '';

      } catch (err) {
        msgEl.textContent = 'Something went wrong. Please try again.';
        msgEl.className   = 'bf-form-msg error';
        BFLog.error('reviews', 'Review fetch failed', err);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Suggest this video';
      }
    });
  }


  /* ───────────────────────────────────────────────────────────
     HELPER — escape HTML to prevent XSS in user content
  ─────────────────────────────────────────────────────────── */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  /* ───────────────────────────────────────────────────────────
     7. INIT
  ─────────────────────────────────────────────────────────── */
  return {
    init() {
      if (!db) {
        BFLog.warn('init', 'Supabase not loaded');
        return;
      }
      initReviews();
      initIndexAggregates();
      initVideoSystem();
    }
  };

})();

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => BRAINFOLDS.init());
} else {
  BRAINFOLDS.init();
}
