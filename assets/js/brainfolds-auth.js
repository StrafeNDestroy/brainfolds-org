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
  const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
  const SUPABASE_KEY = 'YOUR_ANON_KEY_HERE';

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
    // Fire immediately with current state so UI can render
    if ( _user ) {
      try { fn( _user, 'EXISTING_SESSION' ); } catch ( e ) { if ( typeof BFLog !== 'undefined' ) BFLog.error( 'auth', 'listener error on existing session', e ); }
    }
  }

  /*
  ====================
  GetSupabaseClient

   Returns the initialized Supabase client for use by reviews/contribute.
   Returns null if offline or not loaded.
  ====================
  */
  function getClient() { return _db; }

  /* ── Notification Bell ───────────────────────────────────── */

  /*
  ====================
  InitNotificationBell

   Injects a notification bell into the site header when the user
   is signed in. Shows unread count badge. Clicking opens a dropdown
   with recent notifications. Marks all as read on open.
  ====================
  */
  function initNotificationBell() {
    if ( isOffline || !_db ) return;

    // Only show bell for signed-in users
    function renderBell( user ) {
      // Remove existing bell if any
      const existing = document.getElementById( 'bf-notif-bell' );
      if ( existing ) existing.remove();
      const existingDrop = document.getElementById( 'bf-notif-dropdown' );
      if ( existingDrop ) existingDrop.remove();

      if ( !user ) return;

      const header = document.querySelector( '.site-header-inner' ) ||
                     document.querySelector( '.site-header' ) ||
                     document.querySelector( 'header' );
      if ( !header ) return;

      // Bell button
      const bell = document.createElement( 'button' );
      bell.id = 'bf-notif-bell';
      bell.setAttribute( 'aria-label', 'Notifications' );
      bell.style.cssText = 'position:relative;background:none;border:none;cursor:pointer;font-size:1.2rem;padding:4px 8px;color:var(--text-mid,#888);margin-left:auto;';
      bell.textContent = '🔔';

      const badge = document.createElement( 'span' );
      badge.id    = 'bf-notif-badge';
      badge.style.cssText = 'display:none;position:absolute;top:0;right:2px;background:#e74c3c;color:#fff;font-size:0.55rem;font-weight:700;border-radius:50%;min-width:14px;height:14px;line-height:14px;text-align:center;padding:0 3px;';
      bell.appendChild( badge );

      // Dropdown
      const dropdown = document.createElement( 'div' );
      dropdown.id = 'bf-notif-dropdown';
      dropdown.style.cssText = 'display:none;position:fixed;top:50px;right:16px;width:320px;max-height:400px;overflow-y:auto;background:var(--surface,#1a1a1a);border:1px solid var(--border,#333);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:10001;padding:0;';

      // Insert into header
      header.style.position = 'relative';
      header.appendChild( bell );
      document.body.appendChild( dropdown );

      // Load unread count
      loadUnreadCount( user.id, badge );

      // Toggle dropdown on click
      let dropOpen = false;
      bell.addEventListener( 'click', async ( e ) => {
        e.stopPropagation();
        dropOpen = !dropOpen;
        dropdown.style.display = dropOpen ? 'block' : 'none';
        if ( dropOpen ) {
          await loadNotifications( user.id, dropdown );
          // Mark all as read
          await _db.rpc( 'mark_notifications_read', { p_user_id: user.id } );
          badge.style.display = 'none';
          badge.textContent   = '';
        }
      });

      // Close on outside click
      document.addEventListener( 'click', () => {
        if ( dropOpen ) {
          dropOpen = false;
          dropdown.style.display = 'none';
        }
      });
      dropdown.addEventListener( 'click', ( e ) => e.stopPropagation() );
    }

    async function loadUnreadCount( userId, badge ) {
      try {
        const { data, error } = await _db.rpc( 'unread_notification_count', { p_user_id: userId } );
        if ( error ) return;
        if ( data && data > 0 ) {
          badge.textContent   = data > 99 ? '99+' : String( data );
          badge.style.display = 'block';
        }
      } catch ( err ) { /* silent */ }
    }

    async function loadNotifications( userId, dropdown ) {
      try {
        const { data, error } = await _db
          .from( 'notifications' )
          .select( '*' )
          .eq( 'user_id', userId )
          .order( 'created_at', { ascending: false } )
          .limit( 20 );

        if ( error ) throw error;

        dropdown.innerHTML = '';

        const header = document.createElement( 'div' );
        header.style.cssText = 'padding:12px 16px;font-size:0.82rem;font-weight:600;border-bottom:1px solid var(--border,#333);color:var(--text,#ccc);';
        header.textContent = 'Notifications';
        dropdown.appendChild( header );

        if ( !data || data.length === 0 ) {
          const empty = document.createElement( 'div' );
          empty.style.cssText = 'padding:24px 16px;text-align:center;font-size:0.78rem;color:var(--text-muted,#666);';
          empty.textContent = 'No notifications yet.';
          dropdown.appendChild( empty );
          return;
        }

        data.forEach( n => {
          const item = document.createElement( 'div' );
          item.style.cssText = 'padding:10px 16px;border-bottom:1px solid var(--border,#222);cursor:default;' +
            ( n.read ? 'opacity:0.6;' : '' );

          const title = document.createElement( 'div' );
          title.style.cssText = 'font-size:0.78rem;font-weight:' + ( n.read ? '400' : '600' ) + ';color:var(--text,#ccc);';
          title.textContent = n.title;

          const body = document.createElement( 'div' );
          body.style.cssText = 'font-size:0.7rem;color:var(--text-muted,#888);margin-top:2px;';
          body.textContent = n.body || '';

          const time = document.createElement( 'div' );
          time.style.cssText = 'font-size:0.6rem;color:var(--text-muted,#666);margin-top:4px;';
          const diff = Date.now() - new Date( n.created_at ).getTime();
          const mins = Math.floor( diff / 60000 );
          if ( mins < 60 )       time.textContent = mins + 'm ago';
          else if ( mins < 1440 ) time.textContent = Math.floor( mins / 60 ) + 'h ago';
          else                    time.textContent = Math.floor( mins / 1440 ) + 'd ago';

          item.appendChild( title );
          item.appendChild( body );
          item.appendChild( time );

          // If it has a page_key, make it clickable
          if ( n.page_key ) {
            item.style.cursor = 'pointer';
            item.addEventListener( 'click', () => {
              // Navigate to the chapter (page_key is like self-sufficiency/s01-foundation/c01-botany-basics/ch01)
              const parts = n.page_key.split( '/' );
              if ( parts.length >= 1 ) {
                window.location.href = '/' + n.page_key + '.html';
              }
            });
          }

          dropdown.appendChild( item );
        });
      } catch ( err ) {
        dropdown.innerHTML = '<div style="padding:16px;font-size:0.78rem;color:var(--text-muted);">Could not load notifications.</div>';
      }
    }

    // Wire to auth state
    onAuthChange( ( user ) => renderBell( user ) );
  }

  /* ── Boot ───────────────────────────────────────────────── */
  if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', () => { initClient(); initNotificationBell(); } );
  } else {
    initClient();
    initNotificationBell();
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
