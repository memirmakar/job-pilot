// Phone access (docs/plans/done/remote-access.md): starts the server at Windows sign-in, keeps the PC awake while it runs, and reads the Tailscale address.
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { DIR, loadSettings } from "./config.mjs";

// A test copy (JP_TEST_COPY=1) never adds the startup shortcut or keeps the PC awake
const TEST_COPY = !!process.env.JP_TEST_COPY;
const PORT = Number(process.env.PORT) || 4510;
const STARTUP = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Job Pilot (phone access).lnk");
const TAILSCALE = ["tailscale", path.join(process.env.ProgramFiles || "C:\\Program Files", "Tailscale", "tailscale.exe")];

const run = (exe, args) => new Promise((resolve, reject) => execFile(exe, args, { windowsHide: true, timeout: 8000 },
  (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()))));
const ps = (script) => run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);

// ---------- keep the PC awake (the screen may still turn off) ----------
// A hidden PowerShell holds ES_CONTINUOUS | ES_SYSTEM_REQUIRED and exits by itself when this server is gone
let awake = null;
function keepAwake(on) {
  if (TEST_COPY) return;
  if (!on) { awake?.kill(); awake = null; return; }
  if (awake) return;
  const script = `Add-Type -Name P -Namespace JobPilot -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';` +
    `[JobPilot.P]::SetThreadExecutionState([uint32]2147483649) | Out-Null;` +
    `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }`;
  awake = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, stdio: "ignore" });
  awake.on("exit", () => { awake = null; });
}
process.on("exit", () => awake?.kill());

// ---------- start at Windows sign-in (a Startup-folder shortcut to `launch.vbs server`) ----------
async function startAtLogin(on) {
  if (TEST_COPY) return;
  if (!on) { fs.rmSync(STARTUP, { force: true }); return; }
  const vbs = path.join(DIR, "launch.vbs");
  await ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${STARTUP.replace(/'/g, "''")}');` +
    `$s.TargetPath = 'wscript.exe'; $s.Arguments = '"${vbs.replace(/'/g, "''")}" server'; $s.WorkingDirectory = '${DIR.replace(/'/g, "''")}';` +
    `$s.Description = 'Job Pilot for phone access'; $s.Save()`);
}

// ---------- Tailscale (read only; cached briefly because /api/state is read often) ----------
let tsCache = null;
async function tailscale() {
  if (tsCache && Date.now() - tsCache.at < 30000) return tsCache.info;
  let info = { installed: false };
  for (const exe of TAILSCALE) {
    let st;
    try { st = JSON.parse(await run(exe, ["status", "--json"])); } catch (e) { if (/ENOENT/.test(e.message)) continue; info = { installed: true, running: false }; break; }
    const host = (st.Self?.DNSName || "").replace(/\.$/, "");
    let serving = false;
    try { serving = (await run(exe, ["serve", "status", "--json"])).includes(`:${PORT}`); } catch {}
    info = { installed: true, running: st.BackendState === "Running", address: host ? `https://${host}` : "", serving };
    break;
  }
  tsCache = { at: Date.now(), info };
  return info;
}

export async function remoteInfo() {
  return { on: !!loadSettings().remoteAccess, startup: fs.existsSync(STARTUP), awake: !!awake, testCopy: TEST_COPY, port: PORT, tailscale: await tailscale() };
}
// Turn phone access on or off: the startup shortcut and keeping awake follow the setting
export async function applyRemote(on) {
  keepAwake(on);
  await startAtLogin(on);
  tsCache = null;
  return on ? "on" : "off";
}
// A request from another device: `tailscale serve` adds Tailscale-User-Login, and only it reaches us without a local Host
export const fromPhone = (req) => !!req.headers["tailscale-user-login"] || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(req.headers.host || "");
// Actions that open a window on this PC: useless from the phone, so the server refuses them there
export const PC_ONLY = new Set(["POST /api/login/linkedin", "POST /api/login/claude"]);
// At server start: keep awake again if phone access is on
export function startRemote() { if (loadSettings().remoteAccess) keepAwake(true); }
