# Remote access from the phone
Status: Active      Started: 2026-10-23

## Goal
The user wants to open Job Pilot from their Android phone (and other devices) when away from home, not only on this PC.
Done means: from the phone, over mobile data, the user opens one bookmarked address, enters a passcode, and can use every
screen comfortably on a small screen. The app keeps running on this Windows PC. Nothing is reachable from the public internet.

## Decisions
- Decided 2026-10-23: the app keeps running on this Windows PC. Porting the host to Linux is out of scope for this plan.
- Decided 2026-10-23: remote access goes through Tailscale only, a private network between the user's own devices.
  The server keeps listening on 127.0.0.1 only. `tailscale serve` forwards the tailnet's HTTPS address to it.
  Never Tailscale Funnel, never router port forwarding. Also in docs/DECISIONS.md (18).
- Decided 2026-10-23: no passcode. The user's Tailscale account is the only gate; README and Settings > Phone access say so. Stage 2 is skipped.
- Decided 2026-10-23: the app keeps the PC awake while phone access is on (a hidden PowerShell holding SetThreadExecutionState); the screen may still turn off.
- Open (separate plan): replace the Windows scheduled task with a timer inside the server. This makes sense once the server always runs (stage 3).
  Research is summarized in the 2026-10-23 chat: Hermes Agent was rejected because its gateway itself relies on a Windows scheduled task.

## Stages
- [x] 1. Reach the app over Tailscale (done 2026-10-23; the user still has to try it on the phone): write the user's setup steps in README.md (a "Use it from your phone" section).
  The steps: install Tailscale on the PC and phone with one account, turn on HTTPS certificates in the admin console, run `tailscale serve --bg 4510`.
  The user does these steps; Claude never creates accounts or signs in. Then check the app works behind the proxy.
  `server.mjs:223` builds URLs from the Host header; check file uploads, downloads, long-running run output and the Claude login button.
  Files: README.md, server.mjs. Done means: the user opens `https://<pc-name>.<tailnet>.ts.net` on the phone and every screen loads.
- [-] 2. Skipped (no passcode, decided 2026-10-23). Was: passcode for remote requests: requests carrying Tailscale Serve's `Tailscale-User-Login` header, or a Host that isn't 127.0.0.1, must have a session cookie
  (HttpOnly, Secure, SameSite=Strict). The cookie comes from a passcode screen. The passcode is stored hashed with `crypto.scrypt` in data/ and is set and changed in Settings.
  Requests that change something also need a matching Origin. Use a new module (e.g. `remote_auth.mjs`); keep server.mjs small.
  Done means: the phone without a cookie gets only the passcode screen, the API answers 401, and the PC is unchanged.
- [x] 3. Always reachable (done 2026-10-23; the startup shortcut comes only from Settings, not install.ps1): the server starts at login (a Startup-folder shortcut to `launch.vbs`, switchable in Settings).
  Settings show "Remote access: on, <address>". Quit warns that the phone will lose access. Apply the stage-3 sleep decision.
  Done means: after a reboot and login, the phone reaches the app without touching the PC.
- [x] 4. Phone-friendly UI (done 2026-10-23): narrow layouts for every screen, touch-sized controls, and a web app manifest plus icons so Android can "Add to Home screen".
  Follow ui/CLAUDE.md. Check at 375 px wide in Mocha and Latte.
- [ ] 5. Things that need the PC **Next**: some actions open a window on the PC and are useless from the phone.
  - the Claude login window (`server.mjs:187`)
  - LinkedIn sign-in and checks in the visible Edge window (`linkedin.mjs:35`, `headless = false`)
  - onboarding

  When a request comes from the phone, show "Do this at your PC" instead. Done means: no button on the phone silently does something only visible on the PC.

## Handover
Stage 4 done:
- Most screens already switched to one column under 760 px, with back buttons.
- Measured at 375 px (mobile emulation, touch on): only long chips ran off the screen (Insights fields, the resume detail's field chips).
- `ui/styles/phone.css` (loaded last) lets chips wrap under 760 px. On touch screens only (`pointer: coarse`), it enlarges buttons, segments, chips, switches and to-do checkboxes.
  Desktop sizes are unchanged (checked: seg 29 px, small button 28 px, chip 30 px).
- Installable: `ui/manifest.webmanifest`, icons in `ui/icons/` drawn by `node tools/gen-icons.mjs` (the top bar's check mark), theme-color per theme,
  and MIME types for .webmanifest and .png in `server.mjs`. No service worker, because current Chrome doesn't need one to install. "Add to Home screen" needs HTTPS, which `tailscale serve` gives.
- Checked: all screens plus the resume detail at 375 px in Mocha and Latte, with no overflow and no console errors.
  Not checked: a real Android phone, and the install prompt itself.
- Stage 5 (Tailscale's own facts): a request from the phone has the `Tailscale-User-Login` header.
  PC-only actions: the Claude login window (`server.mjs` "Claude login"), anything that opens the visible Edge (LinkedIn sign-in, `linkedin.mjs` launch), and onboarding.

## Next prompt
    Continue docs/plans/remote-access.md
