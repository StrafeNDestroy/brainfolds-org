/* ═══════════════════════════════════════════════════════════════
   BRAINFOLDS — brainfolds-reviews.js
   Review system + Video suggestion system
   Updated: April 2026
   Refactored: April 2026 — XSS fix, error handling, input validation
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   1. CONFIG + SUPABASE CLIENT (via BFAuth shared client)
───────────────────────────────────────────────────────────── */
const BRAINFOLDS = (() => {
  'use strict';

  /* ── Constants (from BFConfig if available, else defaults) ── */
  const _c                = ( typeof BFConfig !== 'undefined' ) ? BFConfig : {};
  const MAX_STARS         = _c.MAX_STARS        || 10;
  const MIN_REVIEWS_SHOW  = _c.MIN_REVIEWS_SHOW || 10;
  const REVIEWS_PER_PAGE  = 8;
  const MAX_NAME_LENGTH   = _c.MAX_NAME_LENGTH  || 20;
  const MAX_REVIEW_LENGTH = _c.MAX_REVIEW_LENGTH || 1000;

  /*  OFFLINE CHECK: Disable database if running locally or as a file */
  const isOffline = window.location.protocol === 'file:' ||
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

  // Use the shared BFAuth client instead of creating a second one
  const db = ( !isOffline && typeof BFAuth !== 'undefined' )
    ? BFAuth.getClient()
    : null;

  if ( isOffline && typeof console !== 'undefined' ) {
    console.log( 'BRAINFOLDS: Offline mode — Supabase bypassed.' );
  }

  /* ───────────────────────────────────────────────────────────
     2. UTILITIES
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  EscHtml

   HTML-escape a string to prevent XSS when inserting into the DOM.
   Covers the five characters that can break out of HTML attribute
   or element context: & < > " '
  ====================
  */
  function escHtml( str ) {
    return String( str || '' )
      .replace( /&/g, '&amp;' )
      .replace( /</g, '&lt;' )
      .replace( />/g, '&gt;' )
      .replace( /"/g, '&quot;' )
      .replace( /'/g, '&#39;' );
  }

  /*
  ====================
  GetPageKey

   Derive a stable page identifier from the URL path.
   e.g. /self-sufficiency/s01-foundation/c03-soil-science/ch04.html → "self-sufficiency/s01/c03/ch04"
  ====================
  */
  function getPageKey() {
    const path  = window.location.pathname.replace( /\/index\.html$/, '/' );
    const parts = path.split( '/' ).filter( Boolean );
    const shorten = seg => {
      if ( /^s\d+/.test( seg ) ) return seg.match( /^(s\d+)/ )?.[1] ?? seg;
      if ( /^c\d+/.test( seg ) ) return seg.match( /^(c\d+)/ )?.[1] ?? seg;
      if ( /^ch\d+/.test( seg ) ) return seg.replace( '.html', '' ).match( /^(ch\d+)/ )?.[1] ?? seg;
      return seg.replace( '.html', '' );
    };
    return parts.map( shorten ).join( '/' );
  }

  /*
  ====================
  GetBrowserToken

   Return a stable anonymous token for this browser.
   Created once, stored in localStorage.
  ====================
  */
  function getBrowserToken() {
    let t = localStorage.getItem( 'bf_token' );
    if ( !t ) {
      t = crypto.randomUUID();
      localStorage.setItem( 'bf_token', t );
    }
    return t;
  }

  /*
  ====================
  RenderStars

   Build a star rating display string using DOM-safe escaped HTML.
   Filled stars up to the rounded rating, empty stars for the rest.
  ====================
  */
  function renderStars( rating, max ) {
    max = max || MAX_STARS;
    const filled = Math.round( rating );
    return Array.from( { length: max }, ( _, i ) =>
      `<span class="bf-star ${i < filled ? 'bf-star-filled' : 'bf-star-empty'}">★</span>`
    ).join( '' );
  }

  /*
  ====================
  TimeAgo

   Human-readable relative timestamp.
  ====================
  */
  function timeAgo( ts ) {
    const diff = Date.now() - new Date( ts ).getTime();
    const mins = Math.floor( diff / 60000 );
    if ( mins < 1 )  return 'just now';
    if ( mins < 60 ) return `${mins}m ago`;
    const hrs = Math.floor( mins / 60 );
    if ( hrs < 24 )  return `${hrs}h ago`;
    const days = Math.floor( hrs / 24 );
    if ( days < 30 ) return `${days}d ago`;
    return new Date( ts ).toLocaleDateString( 'en-US', { month: 'short', year: 'numeric' } );
  }

  /*
  ====================
  ExtractYouTubeId

   Extract the 11-character video ID from various YouTube URL formats.
   Returns null if no valid ID is found.
  ====================
  */
  function extractYouTubeId( url ) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for ( const p of patterns ) {
      const m = url.match( p );
      if ( m ) return m[1];
    }
    return null;
  }

  /* ───────────────────────────────────────────────────────────
     3. DOM BUILDERS (DRAWER & BADGE)
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  BuildDrawer

   Construct the review drawer overlay and panel.
   All user-facing text is static — dynamic content uses textContent.
  ====================
  */
  function buildDrawer() {
    const overlay = document.createElement( 'div' );
    overlay.className = 'bf-drawer-overlay';
    overlay.setAttribute( 'aria-hidden', 'true' );

    const drawer = document.createElement( 'div' );
    drawer.className = 'bf-drawer';
    drawer.setAttribute( 'role', 'dialog' );
    drawer.setAttribute( 'aria-modal', 'true' );
    drawer.setAttribute( 'aria-label', 'Chapter reviews' );

    // Build star picker buttons — static HTML, safe
    const starButtons = Array.from( { length: MAX_STARS }, ( _, i ) =>
      `<span class="bf-star unselected" data-val="${i + 1}" role="button" aria-label="${i + 1} stars" tabindex="0">★</span>`
    ).join( '' );

    drawer.innerHTML = `
      <div class="bf-drawer-header">
        <div class="bf-drawer-score-wrap">
          <div>
            <span class="bf-drawer-score" id="bf-score">—</span>
            <span class="bf-drawer-score-max">/ ${MAX_STARS}</span>
          </div>
          <div class="bf-drawer-stars" id="bf-header-stars"></div>
          <div class="bf-drawer-count" id="bf-count">No reviews yet</div>
        </div>
        <button class="bf-drawer-close" id="bf-close" aria-label="Close reviews">✕</button>
      </div>
      <div class="bf-drawer-body" id="bf-drawer-body">
        <label class="bf-form-label">Rate this chapter</label>
        <div class="bf-star-picker" id="bf-star-picker" role="group" aria-label="Rating 1 to 10">
          ${starButtons}
        </div>
        <div class="bf-auth-row" id="bf-auth-row"></div>
        <input class="bf-input" id="bf-name" type="text" placeholder="Your name (optional)" maxlength="${MAX_NAME_LENGTH}" autocomplete="off" />
        <div class="bf-comment-type" id="bf-comment-type" role="group" aria-label="Comment type">
          <button class="bf-type-btn active" data-type="general">General</button>
          <button class="bf-type-btn" data-type="congrats">Congrats</button>
          <button class="bf-type-btn" data-type="feedback">Feedback</button>
        </div>
        <textarea class="bf-textarea" id="bf-text" placeholder="Leave a review (optional)" maxlength="${MAX_REVIEW_LENGTH}"></textarea>
        <button class="bf-submit-btn" id="bf-submit">Submit review</button>
        <div class="bf-form-msg" id="bf-msg"></div>
        <hr class="bf-divider">
        <div class="bf-reviews-title" id="bf-feed-title">Recent reviews</div>
        <div id="bf-feed"></div>
        <button class="bf-load-more" id="bf-load-more" style="display:none">Load more</button>
      </div>
    `;
    document.body.appendChild( overlay );
    document.body.appendChild( drawer );
    return { overlay, drawer };
  }

  /*
  ====================
  BuildFooterBadge

   Create the clickable footer badge showing the chapter's average rating.
  ====================
  */
  function buildFooterBadge( avg, count, scoreVisible ) {
    const badge = document.createElement( 'div' );
    badge.className  = 'bf-footer-badge';
    badge.id         = 'bf-footer-badge';
    badge.setAttribute( 'role', 'button' );
    badge.setAttribute( 'tabindex', '0' );
    badge.setAttribute( 'aria-label',
      `${scoreVisible ? avg + ' out of 10' : 'Ratings pending'} — open reviews` );

    const scoreText = scoreVisible ? avg.toFixed( 1 ) : '—';
    const countText = count === 0
      ? 'Be the first to review'
      : count < MIN_REVIEWS_SHOW
        ? `${count} rating${count === 1 ? '' : 's'} — score shows at ${MIN_REVIEWS_SHOW}`
        : `${count} reviews`;

    badge.innerHTML = `
      <div class="bf-badge-score">${escHtml( scoreText )}<span> / ${MAX_STARS}</span></div>
      <div class="bf-badge-right">
        <div class="bf-badge-stars">${scoreVisible ? renderStars( avg ) : '——————————'}</div>
        <div class="bf-badge-label">${escHtml( countText )}</div>
      </div>
      <div class="bf-badge-cta">Reviews →</div>
    `;
    return badge;
  }

  /* ───────────────────────────────────────────────────────────
     4. REVIEW FEED RENDERING (XSS-SAFE)
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  RenderReviewItem

   Build a single review card using DOM methods — never innerHTML
   with user-provided data. All user text goes through textContent.
  ====================
  */
  /*
  ====================
  VoteOnReview

   Submit a like (+1) or dislike (-1) on a review.
   Uses browser_token for uniqueness. Upserts (changes vote if re-clicked).
  ====================
  */
  async function voteOnReview( reviewId, vote, likeBtn, dislikeBtn ) {
    if ( !db ) return;
    try {
      const token  = getBrowserToken();
      const userId = ( typeof BFAuth !== 'undefined' && BFAuth.getUser() )
        ? BFAuth.getUser().id : null;

      const { error } = await db
        .from( 'review_votes' )
        .upsert({
          review_id:     reviewId,
          vote:          vote,
          browser_token: token,
          user_id:       userId,
        }, { onConflict: 'review_id,browser_token' });

      if ( error ) throw error;

      // Update button states visually
      likeBtn.classList.toggle( 'bf-vote-active', vote === 1 );
      dislikeBtn.classList.toggle( 'bf-vote-active', vote === -1 );

      // Update counts
      const { data: counts } = await db
        .from( 'review_votes' )
        .select( 'vote' )
        .eq( 'review_id', reviewId );

      if ( counts ) {
        const likes    = counts.filter( v => v.vote === 1 ).length;
        const dislikes = counts.filter( v => v.vote === -1 ).length;
        likeBtn.querySelector( '.bf-vote-count' ).textContent    = likes > 0 ? likes : '';
        dislikeBtn.querySelector( '.bf-vote-count' ).textContent = dislikes > 0 ? dislikes : '';
      }
    } catch ( err ) {
      if ( typeof BFLog !== 'undefined' ) BFLog.error( 'reviews', 'Vote failed', err );
    }
  }

  function renderReviewItem( review ) {
    const item = document.createElement( 'div' );
    item.className = 'bf-review-item';

    // Meta line: name + type badge + stars
    const meta = document.createElement( 'div' );
    meta.className = 'bf-review-meta';

    const nameEl = document.createElement( 'b' );
    nameEl.textContent = review.reviewer_name || 'Anonymous';

    // Comment type badge
    const commentType = review.comment_type || 'general';
    const typeBadge = document.createElement( 'span' );
    typeBadge.className = 'bf-type-badge bf-type-' + commentType;
    const typeLabels = { general: 'General', congrats: 'Congrats', feedback: 'Feedback' };
    typeBadge.textContent = typeLabels[commentType] || 'General';

    const starsEl = document.createElement( 'span' );
    starsEl.innerHTML = renderStars( review.rating );

    meta.appendChild( nameEl );
    meta.appendChild( document.createTextNode( ' ' ) );
    meta.appendChild( typeBadge );
    meta.appendChild( document.createTextNode( ' ' ) );
    meta.appendChild( starsEl );

    // Review text
    const textEl = document.createElement( 'p' );
    textEl.textContent = review.review_text || '';

    // Like / dislike row
    const voteRow = document.createElement( 'div' );
    voteRow.className = 'bf-vote-row';

    const likeBtn = document.createElement( 'button' );
    likeBtn.className = 'bf-vote-btn bf-vote-like';
    likeBtn.innerHTML = '▲ <span class="bf-vote-count">' +
      ( ( review.likes && review.likes > 0 ) ? review.likes : '' ) + '</span>';
    likeBtn.setAttribute( 'aria-label', 'Like this review' );
    likeBtn.setAttribute( 'title', 'Helpful' );

    const dislikeBtn = document.createElement( 'button' );
    dislikeBtn.className = 'bf-vote-btn bf-vote-dislike';
    dislikeBtn.innerHTML = '▼ <span class="bf-vote-count">' +
      ( ( review.dislikes && review.dislikes > 0 ) ? review.dislikes : '' ) + '</span>';
    dislikeBtn.setAttribute( 'aria-label', 'Dislike this review' );
    dislikeBtn.setAttribute( 'title', 'Not helpful' );

    // Mark active if user already voted
    if ( review.user_vote === 1 )  likeBtn.classList.add( 'bf-vote-active' );
    if ( review.user_vote === -1 ) dislikeBtn.classList.add( 'bf-vote-active' );

    likeBtn.addEventListener( 'click', () => voteOnReview( review.id, 1, likeBtn, dislikeBtn ) );
    dislikeBtn.addEventListener( 'click', () => voteOnReview( review.id, -1, likeBtn, dislikeBtn ) );

    voteRow.appendChild( likeBtn );
    voteRow.appendChild( dislikeBtn );

    // Timestamp
    const timeEl = document.createElement( 'span' );
    timeEl.className = 'bf-review-time';
    timeEl.textContent = timeAgo( review.created_at );
    voteRow.appendChild( timeEl );

    item.appendChild( meta );
    item.appendChild( textEl );
    item.appendChild( voteRow );
    return item;
  }

  /* ───────────────────────────────────────────────────────────
     5. REVIEW SYSTEM
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  InitReviews

   Wire up the review system: badge, drawer, star picker, submission, feed.
   Handles offline mode, error states, and XSS-safe rendering.
  ====================
  */
  async function initReviews() {
    /* OFFLINE FALLBACK */
    if ( !db ) {
      const chapterFooter = document.querySelector( '.chapter-footer' );
      if ( chapterFooter ) {
        const offlineMsg = document.createElement( 'div' );
        offlineMsg.style.cssText = 'text-align:center; opacity:0.6; font-size:0.8rem; padding:20px; border-top:1px solid rgba(196, 146, 42, 0.1);';
        const em = document.createElement( 'i' );
        em.textContent = 'Note: Live reviews are available on the web version (brainfolds.org).';
        offlineMsg.appendChild( em );
        chapterFooter.insertAdjacentElement( 'beforebegin', offlineMsg );
      }
      return;
    }

    const pageKey       = getPageKey();
    const isChapter     = /\/ch\d+$/.test( pageKey );
    const chapterFooter = document.querySelector( '.chapter-footer' );
    if ( !isChapter || !chapterFooter ) return;

    let avg          = 0;
    let count        = 0;
    let scoreVisible = false;

    try {
      const { data, error } = await db
        .from( 'chapter_scores' )
        .select( 'avg_rating, review_count, score_visible' )
        .eq( 'page_key', pageKey )
        .single();

      if ( error ) throw error;
      if ( data ) {
        avg          = parseFloat( data.avg_rating ) || 0;
        count        = parseInt( data.review_count, 10 ) || 0;
        scoreVisible = data.score_visible === true;
      }
    } catch ( err ) {
      /* No reviews yet — use defaults */
      if ( typeof BFLog !== 'undefined' ) {
        BFLog.warn( 'reviews', 'Failed to load chapter scores', err );
      }
    }

    const badge = buildFooterBadge( avg, count, scoreVisible );
    chapterFooter.insertAdjacentElement( 'beforebegin', badge );
    const { overlay, drawer } = buildDrawer();

    /* ── Auth-aware name field ───────────────────────────── */
    const authRow = drawer.querySelector( '#bf-auth-row' );
    const nameInput = drawer.querySelector( '#bf-name' );

    function updateAuthUI() {
      if ( typeof BFAuth === 'undefined' ) return;
      const user = BFAuth.getUser();
      authRow.innerHTML = '';

      if ( user ) {
        // Signed in — show avatar + name, hide manual name field
        nameInput.style.display = 'none';
        nameInput.value = user.name;

        const userRow = document.createElement( 'div' );
        userRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:8px 0 4px;';

        if ( user.avatar ) {
          const av = document.createElement( 'img' );
          av.src = user.avatar;
          av.alt = '';
          av.style.cssText = 'width:28px;height:28px;border-radius:50%;';
          userRow.appendChild( av );
        }

        const nameSpan = document.createElement( 'span' );
        nameSpan.textContent = `Reviewing as ${user.name}`;
        nameSpan.style.cssText = 'font-size:0.82rem;color:var(--text-mid);';
        userRow.appendChild( nameSpan );

        const signOutBtn = document.createElement( 'button' );
        signOutBtn.textContent = 'Sign out';
        signOutBtn.style.cssText = 'margin-left:auto;font-family:var(--mono);font-size:0.62rem;background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:3px;padding:3px 8px;cursor:pointer;';
        signOutBtn.addEventListener( 'click', () => BFAuth.signOut() );
        userRow.appendChild( signOutBtn );

        authRow.appendChild( userRow );
      } else {
        // Not signed in — show optional sign-in prompt (non-blocking)
        nameInput.style.display = '';
        nameInput.value = '';

        const prompt = document.createElement( 'div' );
        prompt.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0 2px;flex-wrap:wrap;';

        const label = document.createElement( 'span' );
        label.textContent = 'or sign in:';
        label.style.cssText = 'font-size:0.72rem;color:var(--text-muted);';
        prompt.appendChild( label );

        const googleBtn = document.createElement( 'button' );
        googleBtn.textContent = 'Google';
        googleBtn.style.cssText = 'font-family:var(--mono);font-size:0.62rem;background:none;border:1px solid var(--border);color:var(--text-mid);border-radius:3px;padding:3px 10px;cursor:pointer;';
        googleBtn.addEventListener( 'click', () => BFAuth.signInWithGoogle() );
        prompt.appendChild( googleBtn );

        const ghBtn = document.createElement( 'button' );
        ghBtn.textContent = 'GitHub';
        ghBtn.style.cssText = 'font-family:var(--mono);font-size:0.62rem;background:none;border:1px solid var(--border);color:var(--text-mid);border-radius:3px;padding:3px 10px;cursor:pointer;';
        ghBtn.addEventListener( 'click', () => BFAuth.signInWithGitHub() );
        prompt.appendChild( ghBtn );

        authRow.appendChild( prompt );
      }
    }

    updateAuthUI();
    if ( typeof BFAuth !== 'undefined' ) {
      BFAuth.onAuthChange( () => updateAuthUI() );
    }

    const scoreEl      = drawer.querySelector( '#bf-score' );
    const headerStarsEl = drawer.querySelector( '#bf-header-stars' );
    const countEl      = drawer.querySelector( '#bf-count' );
    const msgEl        = drawer.querySelector( '#bf-msg' );
    let feedPage       = 0;

    function updateHeader( a, c, v ) {
      scoreEl.textContent   = v ? a.toFixed( 1 ) : '—';
      headerStarsEl.innerHTML = v ? renderStars( a ) : '';
      countEl.textContent   = c === 0
        ? 'No reviews yet'
        : c < MIN_REVIEWS_SHOW
          ? `${c} rating${c === 1 ? '' : 's'} — score shows at ${MIN_REVIEWS_SHOW}`
          : `${c} reviews`;
    }
    updateHeader( avg, count, scoreVisible );

    /* ── Open / close drawer ─────────────────────────────── */
    const openDrawer = () => {
      overlay.classList.add( 'open' );
      drawer.classList.add( 'open' );
      document.body.style.overflow = 'hidden';
      feedPage = 0;
      loadFeed( 0 );
    };
    const closeDrawer = () => {
      overlay.classList.remove( 'open' );
      drawer.classList.remove( 'open' );
      document.body.style.overflow = '';
    };

    badge.addEventListener( 'click', openDrawer );
    overlay.addEventListener( 'click', closeDrawer );
    drawer.querySelector( '#bf-close' ).addEventListener( 'click', closeDrawer );

    /* ── Star Picker ─────────────────────────────────────── */
    let selectedRating = 0;
    const stars = drawer.querySelectorAll( '.bf-star-picker .bf-star' );
    stars.forEach( s => {
      s.addEventListener( 'click', () => {
        selectedRating = parseInt( s.dataset.val, 10 );
        stars.forEach( ( st, i ) => {
          st.className = `bf-star ${i < selectedRating ? 'selected' : 'unselected'}`;
        });
      });
    });

    /* ── Comment Type Picker ─────────────────────────────── */
    let selectedCommentType = 'general';
    const typeBtns = drawer.querySelectorAll( '.bf-type-btn' );
    typeBtns.forEach( btn => {
      btn.addEventListener( 'click', () => {
        typeBtns.forEach( b => b.classList.remove( 'active' ) );
        btn.classList.add( 'active' );
        selectedCommentType = btn.dataset.type;
      });
    });

    /* ── Submit ───────────────────────────────────────────── */
    drawer.querySelector( '#bf-submit' ).addEventListener( 'click', async () => {
      if ( selectedRating === 0 ) {
        msgEl.textContent = 'Please select a rating.';
        return;
      }

      const textInput  = drawer.querySelector( '#bf-text' );

      // Use auth name if signed in, otherwise manual name field
      const authUser   = ( typeof BFAuth !== 'undefined' ) ? BFAuth.getUser() : null;
      const name       = authUser
        ? authUser.name.slice( 0, MAX_NAME_LENGTH )
        : nameInput.value.trim().slice( 0, MAX_NAME_LENGTH );
      const reviewText = textInput.value.trim().slice( 0, MAX_REVIEW_LENGTH );

      msgEl.textContent = 'Submitting…';

      try {
        // Get IP hash for rate limiting
        let ipHash = 'anonymous';
        try {
          const ipRes   = await fetch( 'https://api.ipify.org?format=text' );
          const ipText  = await ipRes.text();
          const ipBytes = new TextEncoder().encode( ipText );
          const hashBuf = await crypto.subtle.digest( 'SHA-256', ipBytes );
          ipHash = Array.from( new Uint8Array( hashBuf ) ).map( b => b.toString(16).padStart(2, '0') ).join( '' );
        } catch ( e ) { /* use default */ }

        const insertData = {
          page_key:      pageKey,
          rating:        selectedRating,
          reviewer_name: name,
          review_text:   reviewText,
          comment_type:  selectedCommentType,
          browser_token: getBrowserToken(),
          ip_hash:       ipHash,
        };

        // Attach user_id if signed in (links review to account)
        if ( authUser ) {
          insertData.user_id = authUser.id;
        }

        const { error } = await db.from( 'reviews' ).insert( insertData );

        if ( error ) throw error;

        msgEl.textContent = 'Thank you for your review!';
        msgEl.className   = 'bf-form-msg bf-form-msg-ok';

        // Reload after a brief pause so the user sees confirmation
        setTimeout( () => location.reload(), 1200 );

      } catch ( err ) {
        msgEl.textContent = 'Could not submit — please try again.';
        msgEl.className   = 'bf-form-msg bf-form-msg-err';
        if ( typeof BFLog !== 'undefined' ) {
          BFLog.error( 'reviews', 'Submit failed', err );
        }
      }
    });

    /* ── Feed loader ─────────────────────────────────────── */
    async function loadFeed( page ) {
      try {
        const rangeStart = page * REVIEWS_PER_PAGE;
        const rangeEnd   = rangeStart + REVIEWS_PER_PAGE - 1;

        // Use the view that includes vote tallies
        const { data, error } = await db
          .from( 'review_with_votes' )
          .select( '*' )
          .eq( 'page_key', pageKey )
          .order( 'created_at', { ascending: false } )
          .range( rangeStart, rangeEnd );

        if ( error ) {
          // Fallback to plain reviews table if view doesn't exist yet
          const fallback = await db
            .from( 'reviews' )
            .select( '*' )
            .eq( 'page_key', pageKey )
            .order( 'created_at', { ascending: false } )
            .range( rangeStart, rangeEnd );
          if ( fallback.error ) throw fallback.error;
          return renderFeedData( fallback.data, page );
        }

        // Check which reviews the current user has voted on
        const token = getBrowserToken();
        if ( data && data.length > 0 ) {
          const reviewIds = data.map( r => r.id );
          const { data: myVotes } = await db
            .from( 'review_votes' )
            .select( 'review_id, vote' )
            .eq( 'browser_token', token )
            .in( 'review_id', reviewIds );

          const voteMap = {};
          if ( myVotes ) myVotes.forEach( v => { voteMap[v.review_id] = v.vote; } );
          data.forEach( r => { r.user_vote = voteMap[r.id] || 0; } );
        }

        renderFeedData( data, page );
      } catch ( err ) {
        if ( typeof BFLog !== 'undefined' ) {
          BFLog.error( 'reviews', 'Failed to load feed', err );
        }
      }
    }

    function renderFeedData( data, page ) {
      const feed = drawer.querySelector( '#bf-feed' );
      if ( page === 0 ) feed.innerHTML = '';

      if ( data && data.length > 0 ) {
        data.forEach( r => feed.appendChild( renderReviewItem( r ) ) );
      }

      const loadMore = drawer.querySelector( '#bf-load-more' );
      if ( data && data.length === REVIEWS_PER_PAGE ) {
        loadMore.style.display = 'block';
      } else {
        loadMore.style.display = 'none';
      }
    }

    /* ── Load More button ────────────────────────────────── */
    drawer.querySelector( '#bf-load-more' ).addEventListener( 'click', () => {
      feedPage++;
      loadFeed( feedPage );
    });
  }

  /* ───────────────────────────────────────────────────────────
     6. VIDEO SYSTEM
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  InitVideoSystem

   Load approved video suggestions for this chapter page from Supabase
   and render them as embedded YouTube iframes.
  ====================
  */
  async function initVideoSystem() {
    if ( !db ) {
      const videoGrid = document.querySelector( '.video-grid' );
      if ( videoGrid ) {
        const msg = document.createElement( 'p' );
        msg.style.cssText = 'opacity:0.6; font-size:0.8rem; grid-column: 1 / -1; text-align:center;';
        const em = document.createElement( 'i' );
        em.textContent = 'Video contributions are managed live via the web version.';
        msg.appendChild( em );
        videoGrid.innerHTML = '';
        videoGrid.appendChild( msg );
      }
      return;
    }

    const pageKey   = getPageKey();
    const isChapter = /\/ch\d+$/.test( pageKey );
    const videoGrid = document.querySelector( '.video-grid' );
    if ( !isChapter || !videoGrid ) return;

    try {
      const { data: videos, error } = await db
        .from( 'video_suggestions' )
        .select( '*' )
        .eq( 'page_key', pageKey )
        .eq( 'status', 'approved' );

      if ( error ) throw error;

      if ( videos && videos.length > 0 ) {
        videoGrid.innerHTML = '';
        videos.forEach( v => {
          const card   = document.createElement( 'div' );
          card.className = 'video-card';
          const iframe = document.createElement( 'iframe' );
          iframe.src         = `https://www.youtube-nocookie.com/embed/${escHtml( v.youtube_id )}`;
          iframe.loading     = 'lazy';
          iframe.allowFullscreen = true;
          iframe.setAttribute( 'title', 'Video resource' );
          card.appendChild( iframe );
          videoGrid.appendChild( card );
        });
      }
    } catch ( err ) {
      if ( typeof BFLog !== 'undefined' ) {
        BFLog.error( 'videos', 'Failed to load video suggestions', err );
      }
    }
  }

  /* ───────────────────────────────────────────────────────────
     7. QUESTION SUBMISSION FORM
  ─────────────────────────────────────────────────────────── */

  /*
  ====================
  InitQuestionForm

   Adds a collapsible "Suggest a Quiz Question" form below the
   review badge on chapter pages. Anonymous submissions allowed,
   rate-limited to 5 per IP per page per 24 hours.
  ====================
  */
  async function initQuestionForm() {
    if ( !db ) return;

    const pageKey   = getPageKey();
    const isChapter = /\/ch\d+$/.test( pageKey );
    const badge     = document.getElementById( 'bf-footer-badge' );
    if ( !isChapter || !badge ) return;

    // Build collapsible question form
    const wrap = document.createElement( 'details' );
    wrap.className = 'bf-question-form';
    wrap.innerHTML = `
      <summary class="bf-question-toggle">Suggest a Quiz Question</summary>
      <div class="bf-question-body">
        <select class="bf-input" id="bf-q-type">
          <option value="">Question type…</option>
          <option value="tf">True / False</option>
          <option value="sa">Short Answer</option>
          <option value="fib">Fill in the Blank</option>
          <option value="practical">Practical / Scenario</option>
        </select>
        <textarea class="bf-textarea" id="bf-q-text" placeholder="Your question" maxlength="1000"></textarea>
        <input class="bf-input" id="bf-q-answer" type="text" placeholder="Correct answer (optional)" maxlength="500" />
        <input class="bf-input" id="bf-q-explain" type="text" placeholder="Brief explanation (optional)" maxlength="500" />
        <button class="bf-submit-btn" id="bf-q-submit">Submit Question</button>
        <div class="bf-form-msg" id="bf-q-msg"></div>
      </div>
    `;

    badge.insertAdjacentElement( 'afterend', wrap );

    // Submit handler
    wrap.querySelector( '#bf-q-submit' ).addEventListener( 'click', async () => {
      const qType    = wrap.querySelector( '#bf-q-type' ).value;
      const qText    = wrap.querySelector( '#bf-q-text' ).value.trim();
      const qAnswer  = wrap.querySelector( '#bf-q-answer' ).value.trim();
      const qExplain = wrap.querySelector( '#bf-q-explain' ).value.trim();
      const msgEl    = wrap.querySelector( '#bf-q-msg' );

      if ( !qType )                     { msgEl.textContent = 'Please select a question type.'; return; }
      if ( !qText || qText.length < 10 ) { msgEl.textContent = 'Question must be at least 10 characters.'; return; }

      msgEl.textContent = 'Submitting…';

      try {
        // Rate limit check
        const ipRes   = await fetch( 'https://api.ipify.org?format=text' );
        const ipText  = await ipRes.text();
        const ipBytes = new TextEncoder().encode( ipText );
        const hashBuf = await crypto.subtle.digest( 'SHA-256', ipBytes );
        const ipHash  = Array.from( new Uint8Array( hashBuf ) ).map( b => b.toString(16).padStart(2, '0') ).join( '' );

        const { data: limited } = await db.rpc( 'question_rate_limited', {
          p_ip_hash:  ipHash,
          p_page_key: pageKey,
        });

        if ( limited ) {
          msgEl.textContent = 'You have reached the question limit for this chapter today (5 per 24 hours).';
          return;
        }

        const authUser = ( typeof BFAuth !== 'undefined' ) ? BFAuth.getUser() : null;

        const { error } = await db.from( 'question_submissions' ).insert({
          page_key:       pageKey,
          question_type:  qType,
          question_text:  qText,
          correct_answer: qAnswer || null,
          explanation:    qExplain || null,
          user_id:        authUser ? authUser.id : null,
          submitter_name: authUser ? authUser.name : null,
          ip_hash:        ipHash,
        });

        if ( error ) throw error;

        msgEl.textContent = 'Question submitted — thank you!';
        msgEl.className   = 'bf-form-msg bf-form-msg-ok';
        wrap.querySelector( '#bf-q-type' ).value    = '';
        wrap.querySelector( '#bf-q-text' ).value    = '';
        wrap.querySelector( '#bf-q-answer' ).value  = '';
        wrap.querySelector( '#bf-q-explain' ).value = '';

      } catch ( err ) {
        msgEl.textContent = 'Could not submit — please try again.';
        if ( typeof BFLog !== 'undefined' ) BFLog.error( 'questions', 'Submit failed', err );
      }
    });
  }

  /* ───────────────────────────────────────────────────────────
     8. INIT
  ─────────────────────────────────────────────────────────── */
  return {
    init() {
      initReviews();
      initQuestionForm();
      initVideoSystem();
    }
  };
})();

document.addEventListener( 'DOMContentLoaded', () => BRAINFOLDS.init() );
