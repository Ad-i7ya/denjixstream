# Security & Ad-Proofing

This document explains how DenjiXstream blocks ads **without** sandboxing the player,
why that design was chosen, and the audit policy that keeps the server list clean.

## Threat model

Embed servers (`zxcstream`, `vidlink`, `vidgod`, …) are third-party web pages shown in
an `<iframe>`. They are fully trusted to *play video* but not to *redirect users*.
The attacks we defend against:

1. **Clickjacking ad-overlays** — an invisible ad layer over the video that opens an
   ad tab on the first click/tap.
2. **Ad popups / popunders** — `window.open()` fired by embed scripts.
3. **Hidden-iframe popup cloaking** — opening the ad tab from a *nested* iframe's
   window (`u.contentWindow.open(...)`) so the parent page cannot observe it.
4. **Top-navigation hijack** — embedding trying to navigate our page away.

## Design decision: no `sandbox` attribute

`sandbox="allow-scripts allow-same-origin …"` *can* block popups, but several popular
embeds **detect a sandboxed frame and refuse to play** (the "sandbox error" seen during
development). Removing the attribute fixes 100% server compatibility — at the cost of
losing the browser-level popup block. Every other layer below exists to recover that
protection without sandboxing.

## Defense layers

### 1. No `allow-top-navigation` (the only hard guarantee)

With no `sandbox` attribute we cannot stop an embed navigating the top frame — so this
is mitigated by **server curation** (below) and by the fact that none of the audited
servers attempt it.

### 2. Popup auto-close (3 layers)

While a player is on screen (`#plFrame` exists), any popup that surfaces on **our**
window is closed instantly unless its URL is allowlisted:

- `popup` **event listener** — the browser tells us about popups opened from our page
  context (including `target="_blank"` links).
- **`window.open` wrapper** — a second net for engines that skip the event.
- **Periodic sweep** (every 400 ms) — re-closes remembered ad tabs whose `close()`
  was rejected at open time.

**Allowlist** (`POPUP_ALLOW`): `t.me`, `telegram.me`, `youtube.com`, `youtu.be`,
`github.com` — the Trailer button and Telegram footer links always work. A 2-second
grace window protects the Trailer popup from the auto-closers.

**Honest limitation:** popups opened from a *cross-origin* iframe fire on the
iframe's own window, not ours — the browser security boundary means a page can never
intercept them. This is precisely why the server list is curated (layer 5).

### 3. Click shield (`pl-shield`)

While armed, the shield swallows **every** pointer interaction
(`pointerdown`, `mousedown`, `touchstart`, `pointerup`, `pointercancel`, `click`) in
capture phase — the embed never receives a single stray tap, so clickjacking
ad-overlays can never fire. It releases only when the user deliberately taps the
**"Enable player"** button (a native, keyboard-accessible `<button>` with a breathing
halo). Re-armed on every server switch and retry.

### 4. No public proxy

The worker exposes no open proxy. Users only ever talk to Cloudflare + the embed
servers. There is no route an attacker could abuse to relay traffic.

### 5. Server audit policy (the real fix)

Popup-cloaking embeds and smartlink servers are **rejected at the door**. Every server
in `EMBED_SERVERS` must pass this checklist before it is added:

1. **HTML scan** — the embed page must contain **zero** `window.open`, popunder,
   `SMARTLINK`, `ad.onclick` or `target="_blank"` ad triggers.
2. **JS bundle scan** — the page's scripts must carry no `window.open(...)` /
   `popunder` / `tabs.create` ad patterns.
3. **Movie + TV test** — both URL shapes must resolve (HTTP 200) and contain a
   player/stream reference.
4. **Re-verified periodically** — providers change; a server that starts shipping
   ads is removed on the next audit.

Known-removed servers: `vidsrc.me` / `airflix` (hidden-iframe popup cloaking),
`XPass`, `2Embed`, `VidZen` (smartlink popunders).

## Privacy & telemetry

- No accounts, no tracking SDKs, no third-party analytics.
- Watchlist, history and watch progress live **only** in the visitor's browser
  (`localStorage`).
- TMDB metadata requests are made server-side by the worker and cached at Cloudflare.
- **Admin telemetry (optional):** when the shared KV namespace is bound, the site sends
  anonymous `visit` / `page` / `watch` / `search` events to `/api/beacon` (IP, country,
  device/OS/browser from the request, page/title/query; bots are filtered server-side).
  Only the owner's **private admin panel** reads this data; it can be exported or wiped
  from the panel, and the whole beacon can be disabled via `statsEnabled` in the panel.

## Admin panel security

- The admin worker is a **private** repo + `noindex` worker, reachable only by URL.
- Google-style email+password sign-in accepting **one** admin email (changeable only
  after authenticating). Passwords stored salted + hashed; login rate-limited
  (5 tries / 10 min / IP); sessions are HMAC-signed, HttpOnly, Secure, SameSite=Strict.

## Reporting issues

For vulnerabilities or an embed that started serving ads, contact
[@te4m1ord](https://t.me/te4m1ord) or open an issue on GitHub. Please include the
server name, the title being played, and what happened.
