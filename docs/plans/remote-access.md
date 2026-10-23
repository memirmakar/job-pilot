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
- [ ] 4. Phone-friendly UI **Next**: narrow layouts for every screen, touch-sized controls, and a web app manifest plus icons so Android can "Add to Home screen".
  Follow ui/CLAUDE.md. Check at 375 px wide in Mocha and Latte.
- [ ] 5. Things that need the PC: some actions open a window on the PC and are useless from the phone.
  - the Claude login window (`server.mjs:187`)
  - LinkedIn sign-in and checks in the visible Edge window (`linkedin.mjs:35`, `headless = false`)
  - onboarding

  When a request comes from the phone, show "Do this at your PC" instead. Done means: no button on the phone silently does something only visible on the PC.

## Handover
Stage 3 done: `remote_access.mjs` turns phone access on and off (the setting is `remoteAccess`). It adds a Startup-folder shortcut, "Job Pilot (phone access).lnk", that runs `launch.vbs server`.
`launch.vbs server` is a new mode that starts the server with `--no-open`. remote_access.mjs also keeps the PC awake with a hidden PowerShell process. That process exits by itself when the server is gone.
It also reads `tailscale status/serve status --json`, cached for 30 s, for `/api/state` `remote`.
Settings has a new section, Phone access (`ui/js/screens/settings/remote.js`). It shows the switch, a startup and awake check, the Tailscale state with the address and a Copy button, and a no-passcode warning.
Quit's confirm warns when phone access is on, and Delete my data turns phone access off.
Tested:
- on a JP_TEST_COPY: the switch saves both ways, the section renders, and there are no console errors
- remote_access.mjs with a fake APPDATA: the shortcut points to wscript.exe "…launch.vbs" server, keep-awake starts and stops, and Windows accepts the SetThreadExecutionState call

Not verified: a real reboot. `powercfg /requests` needs admin, and Tailscale isn't installed here, so the "Ready" state with an address wasn't seen.
Note: /api/state takes about 2 s because of the scheduled-task lookup, so the switch flips only after that.
Stage 5: a request from the phone carries Tailscale's `Tailscale-User-Login` header; use it to show "Do this at your PC".

## Next prompt
    Continue docs/plans/remote-access.md
