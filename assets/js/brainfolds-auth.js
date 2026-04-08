/* ═══════════════════════════════════════════════════════════════
   BRAINFOLDS — brainfolds-auth.js
   OAuth authentication (Google + GitHub) via Supabase Auth.
   No passwords stored — all auth delegated to OAuth providers.

   Architecture:
     - Reviews: sign-in optional (anonymous still works)
     - Contribute: sign-in required (real identity on submissions)
     - Admin: your Supabase user ID in ADMIN_IDS (dashboard only)

   Usage from other scripts:
     BFAuth.getUser()          → { id, email, name, avatar } or null
     BFAuth.isSignedIn()       → boolean
     BFAuth.signInWithGoogle() → redirects to Google OAuth
     BFAuth.signInWithGitHub() → redirects to GitHub OAuth
     BFAuth.signOut()          → clears session
     BFAuth.onAuthChange(fn)   → callback when auth state changes
   ═══════════════════════════════════════════════════════════════ */

const BFAuth = (() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────────── */
  const SUPABASE_URL = ( typeof BFConfig !== 'undefined' ) ? BFConfig.SUPABASE_URL : '';
  const SUPABASE_KEY = ( typeof BFConfig !== 'undefined' ) ? BFConfig.SUPABASE_KEY : '';

  const isOffline = window.location.protocol === 'file:' ||
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

  /* ── State ──────────────────────────────────────────────── */
  let _db        = null;
  let _user      = null;
  let _listeners = [];

  /*
  ====================
  InitClient

   Create the Supabase client and restore any existing session.
   Called once on page load. If offline or Supabase CDN is blocked,
   auth gracefully degrades — everything works anonymously.
  ====================
  */
  function initClient() {
    if ( isOffline || typeof window.supabase === 'undefined' ) return;

    _db = window.supabase.createClient( SUPABASE_URL, SUPABASE_KEY );

    // Listen for auth state changes (login, logout, token refresh)
    _db.auth.onAuthStateChange( ( event, session ) => {
      _user = session?.user ? parseUser( session.user ) : null;
      _listeners.forEach( fn => {
        try { fn( _user, event ); } catch ( e ) {
          if ( typeof BFLog !== 'undefined' ) BFLog.error( 'auth', 'listener error', e );
        }
      });

      if ( typeof BFLog !== 'undefined' ) {
        BFLog.log( 'INIT', 'auth state: ' + event, {
          signedIn: !!_user,
          provider: _user?.provider || null,
          email:    _user?.email || null,
        });
      }
    });

    // Check for existing session on load
    _db.auth.getSession().then( ( { data } ) => {
      if ( data?.session?.user ) {
        _user = parseUser( data.session.user );
        _listeners.forEach( fn => {
          try { fn( _user, 'INITIAL_SESSION' ); } catch ( e ) { if ( typeof BFLog !== 'undefined' ) BFLog.error( 'auth', 'listener error on initial session', e ); }
        });
      }
    });
  }

  /*
  ====================
  ParseUser

   Extract the fields we care about from the Supabase user object.
   Works for both Google and GitHub providers.
  ====================
  */
  function parseUser( supabaseUser ) {
    if ( !supabaseUser ) return null;
    const meta = supabaseUser.user_metadata || {};
    return {
      id:       supabaseUser.id,
      email:    supabaseUser.email || meta.email || null,
      name:     meta.full_name || meta.name || meta.preferred_username || meta.user_name || supabaseUser.email?.split( '@' )[0] || 'User',
      avatar:   meta.avatar_url || meta.picture || null,
      provider: supabaseUser.app_metadata?.provider || null,
    };
  }

  /*
  ====================
  SignInWithGoogle

   Redirects to Google OAuth consent screen. After approval,
   Google redirects back to the current page with an auth token.
   Supabase handles the token exchange automatically.
  ====================
  */
  async function signInWithGoogle() {
    if ( !_db ) return;
    const { error } = await _db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if ( error && typeof BFLog !== 'undefined' ) {
      BFLog.error( 'auth', 'Google sign-in failed', error );
    }
  }

  /*
  ====================
  SignInWithGitHub

   Same as Google but for GitHub OAuth.
  ====================
  */
  async function signInWithGitHub() {
    if ( !_db ) return;
    const { error } = await _db.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.href },
    });
    if ( error && typeof BFLog !== 'undefined' ) {
      BFLog.error( 'auth', 'GitHub sign-in failed', error );
    }
  }

  /*
  ====================
  SignOut

   Clears the session. User returns to anonymous state.
  ====================
  */
  async function signOut() {
    if ( !_db ) return;
    const { error } = await _db.auth.signOut();
    _user = null;
    if ( error && typeof BFLog !== 'undefined' ) {
      BFLog.error( 'auth', 'Sign-out failed', error );
    }
  }

  /*
  ====================
  OnAuthChange

   Register a callback that fires when auth state changes.
   callback( user, event ) — user is null when signed out.
  ====================
  */
  function onAuthChange( fn ) {
    _listeners.push( fn );
    // Fire immediately with current state so UI can render (even if null / signed out)
    try { fn( _user, _user ? 'EXISTING_SESSION' : 'NO_SESSION' ); } catch ( e ) { if ( typeof BFLog !== 'undefined' ) BFLog.error( 'auth', 'listener error on register', e ); }
  }

  /*
  ====================
  GetSupabaseClient

   Returns the initialized Supabase client for use by reviews/contribute.
   Returns null if offline or not loaded.
  ====================
  */
  function getClient() { return _db; }

  /* ── User Nav — Sign In / Profile / Notifications ────────── */

  /*
  ====================
  InitUserNav

   Injects a user auth element into the site-nav on every page.
   Signed out: shows "Sign In" link.
   Signed in: shows avatar + name, with dropdown for notifications and sign out.
   Replaces the old initNotificationBell — notifications now live inside
   the user dropdown instead of a separate bell icon.
  ====================
  */
  function initUserNav() {
    // Render user nav on all pages (Sign In shows even if Supabase isn't connected)

    function renderUserNav( user ) {
      // Remove existing user nav elements
      document.querySelectorAll( '.bf-user-nav' ).forEach( el => el.remove() );
      document.querySelectorAll( '.bf-user-dropdown' ).forEach( el => el.remove() );

      // Find all navs on the page (landing + chapter headers)
      const navs = document.querySelectorAll( '.site-nav' );
      navs.forEach( nav => {
        const wrapper = document.createElement( 'div' );
        wrapper.className = 'bf-user-nav';

        if ( !user ) {
          // ── Signed out: show Sign In link ──────────────
          const signInLink = document.createElement( 'a' );
          signInLink.className = 'site-nav-link bf-sign-in-link';
          signInLink.href = '#';
          signInLink.textContent = 'Sign In';
          signInLink.addEventListener( 'click', ( e ) => {
            e.preventDefault();
            showSignInModal();
          });
          wrapper.appendChild( signInLink );
        } else {
          // ── Signed in: show avatar + name ──────────────
          const userBtn = document.createElement( 'button' );
          userBtn.className = 'bf-user-btn';
          userBtn.setAttribute( 'aria-label', 'Account menu' );
          userBtn.setAttribute( 'aria-expanded', 'false' );

          if ( user.avatar ) {
            const av = document.createElement( 'img' );
            av.src = user.avatar;
            av.alt = '';
            av.className = 'bf-user-avatar';
            userBtn.appendChild( av );
          }

          const nameSpan = document.createElement( 'span' );
          nameSpan.className = 'bf-user-name';
          nameSpan.textContent = user.name;
          userBtn.appendChild( nameSpan );

          // Unread badge
          const badge = document.createElement( 'span' );
          badge.className = 'bf-user-badge';
          badge.style.display = 'none';
          userBtn.appendChild( badge );

          wrapper.appendChild( userBtn );

          // ── Dropdown ───────────────────────────────────
          const dropdown = document.createElement( 'div' );
          dropdown.className = 'bf-user-dropdown';

          // User info header
          const infoDiv = document.createElement( 'div' );
          infoDiv.className = 'bf-user-dropdown-header';
          infoDiv.innerHTML = '';

          const infoName = document.createElement( 'div' );
          infoName.className = 'bf-user-dropdown-name';
          infoName.textContent = user.name;
          infoDiv.appendChild( infoName );

          const infoEmail = document.createElement( 'div' );
          infoEmail.className = 'bf-user-dropdown-email';
          infoEmail.textContent = user.email || '';
          infoDiv.appendChild( infoEmail );

          const infoProvider = document.createElement( 'div' );
          infoProvider.className = 'bf-user-dropdown-provider';
          infoProvider.textContent = 'via ' + ( user.provider || 'OAuth' );
          infoDiv.appendChild( infoProvider );

          dropdown.appendChild( infoDiv );

          // Notifications section
          const notifHeader = document.createElement( 'div' );
          notifHeader.className = 'bf-user-dropdown-section';
          notifHeader.textContent = 'Notifications';
          dropdown.appendChild( notifHeader );

          const notifList = document.createElement( 'div' );
          notifList.className = 'bf-user-notif-list';
          notifList.innerHTML = '<div class="bf-user-notif-empty">Loading...</div>';
          dropdown.appendChild( notifList );

          // Sign out button
          const signOutBtn = document.createElement( 'button' );
          signOutBtn.className = 'bf-user-dropdown-signout';
          signOutBtn.textContent = 'Sign Out';
          signOutBtn.addEventListener( 'click', () => {
            signOut();
            dropdown.classList.remove( 'open' );
            userBtn.setAttribute( 'aria-expanded', 'false' );
          });
          dropdown.appendChild( signOutBtn );

          document.body.appendChild( dropdown );

          // Toggle dropdown
          let dropOpen = false;
          userBtn.addEventListener( 'click', async ( e ) => {
            e.stopPropagation();
            dropOpen = !dropOpen;
            dropdown.classList.toggle( 'open', dropOpen );
            userBtn.setAttribute( 'aria-expanded', String( dropOpen ) );

            if ( dropOpen ) {
              // Position dropdown below button
              const rect = userBtn.getBoundingClientRect();
              dropdown.style.top  = ( rect.bottom + 4 ) + 'px';
              dropdown.style.right = Math.max( 8, window.innerWidth - rect.right ) + 'px';

              // Load notifications
              await loadUserNotifications( user.id, notifList, badge );
            }
          });

          // Close on outside click
          document.addEventListener( 'click', ( e ) => {
            if ( dropOpen && !wrapper.contains( e.target ) && !dropdown.contains( e.target ) ) {
              dropOpen = false;
              dropdown.classList.remove( 'open' );
              userBtn.setAttribute( 'aria-expanded', 'false' );
            }
          });

          // Load unread count immediately
          if ( _db ) loadUnreadBadge( user.id, badge );
        }

        nav.appendChild( wrapper );
      });
    }

    // ── Sign In Modal ──────────────────────────────────────
    function showSignInModal() {
      // Remove existing modal
      const old = document.getElementById( 'bf-signin-modal' );
      if ( old ) old.remove();

      const overlay = document.createElement( 'div' );
      overlay.id = 'bf-signin-modal';
      overlay.className = 'bf-signin-overlay';

      const modal = document.createElement( 'div' );
      modal.className = 'bf-signin-modal';
      modal.innerHTML = `
        <div class="bf-signin-title">Sign in to Brainfolds</div>
        <p class="bf-signin-desc">Sign in to contribute chapters, leave reviews with your name, and get notifications.</p>
        <div class="bf-signin-buttons"></div>
        <button class="bf-signin-close" aria-label="Close">✕</button>
      `;

      const btnsWrap = modal.querySelector( '.bf-signin-buttons' );

      const googleBtn = document.createElement( 'button' );
      googleBtn.className = 'bf-signin-btn bf-signin-google';
      googleBtn.textContent = 'Continue with Google';
      googleBtn.addEventListener( 'click', () => signInWithGoogle() );
      btnsWrap.appendChild( googleBtn );

      const ghBtn = document.createElement( 'button' );
      ghBtn.className = 'bf-signin-btn bf-signin-github';
      ghBtn.textContent = 'Continue with GitHub';
      ghBtn.addEventListener( 'click', () => signInWithGitHub() );
      btnsWrap.appendChild( ghBtn );

      modal.querySelector( '.bf-signin-close' ).addEventListener( 'click', () => overlay.remove() );
      overlay.addEventListener( 'click', ( e ) => { if ( e.target === overlay ) overlay.remove(); } );

      overlay.appendChild( modal );
      document.body.appendChild( overlay );
    }

    // ── Notification helpers ───────────────────────────────
    async function loadUnreadBadge( userId, badge ) {
      if ( !_db ) return;
      try {
        const { data } = await _db.rpc( 'unread_notification_count', { p_user_id: userId } );
        if ( data && data > 0 ) {
          badge.textContent   = data > 99 ? '99+' : String( data );
          badge.style.display = '';
        }
      } catch ( err ) { /* silent */ }
    }

    async function loadUserNotifications( userId, listEl, badge ) {
      if ( !_db ) return;
      try {
        const { data, error } = await _db
          .from( 'notifications' )
          .select( '*' )
          .eq( 'user_id', userId )
          .order( 'created_at', { ascending: false } )
          .limit( 10 );

        if ( error ) throw error;

        listEl.innerHTML = '';

        if ( !data || data.length === 0 ) {
          listEl.innerHTML = '<div class="bf-user-notif-empty">No notifications yet.</div>';
          return;
        }

        data.forEach( n => {
          const item = document.createElement( 'div' );
          item.className = 'bf-user-notif-item' + ( n.read ? '' : ' unread' );

          const title = document.createElement( 'div' );
          title.className = 'bf-user-notif-title';
          title.textContent = n.title;

          const body = document.createElement( 'div' );
          body.className = 'bf-user-notif-body';
          body.textContent = n.body || '';

          const time = document.createElement( 'div' );
          time.className = 'bf-user-notif-time';
          const diff = Date.now() - new Date( n.created_at ).getTime();
          const mins = Math.floor( diff / 60000 );
          if ( mins < 60 )       time.textContent = mins + 'm ago';
          else if ( mins < 1440 ) time.textContent = Math.floor( mins / 60 ) + 'h ago';
          else                    time.textContent = Math.floor( mins / 1440 ) + 'd ago';

          item.appendChild( title );
          item.appendChild( body );
          item.appendChild( time );

          if ( n.page_key ) {
            item.style.cursor = 'pointer';
            item.addEventListener( 'click', () => {
              window.location.href = '/' + n.page_key + '.html';
            });
          }

          listEl.appendChild( item );
        });

        // Mark all as read
        await _db.rpc( 'mark_notifications_read', { p_user_id: userId } );
        badge.style.display = 'none';
        badge.textContent   = '';

      } catch ( err ) {
        listEl.innerHTML = '<div class="bf-user-notif-empty">Could not load.</div>';
      }
    }

    // Wire to auth state changes
    onAuthChange( ( user ) => renderUserNav( user ) );
  }

  /* ── Boot ───────────────────────────────────────────────── */
  if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', () => { initClient(); initUserNav(); } );
  } else {
    initClient();
    initUserNav();
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    getUser:           () => _user,
    isSignedIn:        () => !!_user,
    signInWithGoogle:  signInWithGoogle,
    signInWithGitHub:  signInWithGitHub,
    signOut:           signOut,
    onAuthChange:      onAuthChange,
    getClient:         getClient,
    get user()         { return _user; },
  };
})();
