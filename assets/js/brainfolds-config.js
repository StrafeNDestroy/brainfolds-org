/* ═══════════════════════════════════════════════════════════════
   BRAINFOLDS — brainfolds-config.js
   Master configuration — single source of truth for all
   client-side constants. Every other script reads from here.

   Standards applied:
     - Bug Hunting Part 2: eliminates duplicate config in 7 files
     - NASA Rule 6: Minimize scope — one canonical source
     - id Software §4: Keep code absolutely simple

   To change Supabase credentials, GA ID, or site metadata:
     1. Edit THIS file only
     2. Push — everything else reads from BFConfig

   Stripped by build-offline.py in offline builds.
   ═══════════════════════════════════════════════════════════════ */

const BFConfig = Object.freeze({

  /* ── Supabase ──────────────────────────────────────────── */
  SUPABASE_URL: 'https://dkpxyhamvsefpddlycdu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_pRq6BtwEOpioNYfZsBH6cw_PVYh5OJ4',

  /* ── Google Analytics ──────────────────────────────────── */
  GA_ID: 'G-BEKCFNG494',

  /* ── Site ───────────────────────────────────────────────── */
  SITE_NAME:   'Brainfolds',
  SITE_DOMAIN: 'brainfolds.org',
  SITE_URL:    'https://brainfolds.org',

  /* ── Limits ─────────────────────────────────────────────── */
  MAX_REVIEW_LENGTH:  1000,
  MAX_NAME_LENGTH:    20,
  MAX_STARS:          10,
  MIN_REVIEWS_SHOW:   10,
  MAX_UPLOAD_KB:      500,
  MAX_ATTACH_BYTES:   2 * 1024 * 1024,  // 2 MB total attachments
  MAX_MARKDOWN_CHARS: 100000,
  MIN_MARKDOWN_CHARS: 200,
});
