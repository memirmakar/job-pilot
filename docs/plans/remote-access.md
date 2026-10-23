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
- Open (stage 2): ask for a passcode on requests that arrive through Tailscale? Recommended yes. The app can send applications, and a lost, unlocked phone is still on the tailnet.
  Requests made on the PC itself stay passwordless.
- Open (stage 3): how to keep the PC awake. Either the user sets Windows to never sleep when plugged in, or the app keeps the PC awake while remote access is on.
- Open (separate plan): replace the Windows scheduled task with a timer inside the server. This makes sense once the server always runs (stage 3).
  Research is summarized in the 2026-10-23 chat: Hermes Agent was rejected because its gateway itself relies on a Windows scheduled task.

## Stages
- [x] 1. Reach the app over Tailscale (done 2026-10-23; the user still has to try it on the phone): write the user's setup steps in README.md (a "Use it from your phone" section).
  The steps: install Tailscale on the PC and phone with one account, turn on HTTPS certificates in the admin console, run `tailscale serve --bg 4510`.
  The user does these steps; Claude never creates accounts or signs in. Then check the app works behind the proxy.
  `server.mjs:223` builds URLs from the Host header; check file uploads, downloads, long-running run output and the Claude login button.
  Files: README.md, server.mjs. Done means: the user opens `https://<pc-name>.<tailnet>.ts.net` on the phone and every screen loads.
- [ ] 2. Passcode for remote requests **Next** (first ask the user the stage-2 decision): requests carrying Tailscale Serve's `Tailscale-User-Login` header, or a Host that isn't 127.0.0.1, must have a session cookie
  (HttpOnly, Secure, SameSite=Strict). The cookie comes from a passcode screen. The passcode is stored hashed with `crypto.scrypt` in data/ and is set and changed in Settings.
  Requests that change something also need a matching Origin. Use a new module (e.g. `remote_auth.mjs`); keep server.mjs small.
  Done means: the phone without a cookie gets only the passcode screen, the API answers 401, and the PC is unchanged.
- [ ] 3. Always reachable: the server starts at login (a Startup-folder shortcut to `launch.vbs`, added by install.ps1 and switchable in Settings).
  Settings show "Remote access: on, <address>". Quit warns that the phone will lose access. Apply the stage-3 sleep decision.
  Done means: after a reboot and login, the phone reaches the app without touching the PC.
- [ ] 4. Phone-friendly UI: narrow layouts for every screen, touch-sized controls, and a web app manifest plus icons so Android can "Add to Home screen".
  Follow ui/CLAUDE.md. Check at 375 px wide in Mocha and Latte.
- [ ] 5. Things that need the PC: some actions open a window on the PC and are useless from the phone.
  - the Claude login window (`server.mjs:187`)
  - LinkedIn sign-in and checks in the visible Edge window (`linkedin.mjs:35`, `headless = false`)
  - onboarding

  When a request comes from the phone, show "Do this at your PC" instead. Done means: no button on the phone silently does something only visible on the PC.

## Handover
Stage 1 done: README.md has "Use it from your phone" (Tailscale setup, `tailscale serve --bg 4510`, a warning that there is no passcode yet, never use funnel).
No app code needed changing. Tested with a local proxy that sends a ts.net Host and Tailscale-User-Login headers (`tailscale serve` is not installed here).
All 8 screens loaded, there were no failed requests or console errors, and inline and download PDFs worked. It runs in a secure context, so Copy works over HTTPS.
Not tested: uploads, to keep real data unchanged (test them on a JP_TEST_COPY), and the real phone over mobile data (the user does this).
Stage 2 traps: the server has no Host or Origin checks today; `tailscale serve` sets the `Tailscale-User-Login` header, which local processes could fake.
That is fine, because the PC itself is trusted.

## Next prompt
    Continue docs/plans/remote-access.md
