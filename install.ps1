# Job Pilot setup (started by Install.cmd). Safe to run again; it only adds what's missing.
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $dir "data\runs") | Out-Null
$log = Join-Path $dir "data\install.log"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color; Add-Content $log "$(Get-Date -Format s) $msg" }
function Find-Claude {
  $candidates = @("$env:USERPROFILE\.local\bin\claude.exe")
  $cmd = Get-Command claude -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

try {
  Say "== Job Pilot setup ==" "Cyan"

  # 1. Node.js
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Say "Node.js is required. Installing Node.js LTS with winget (Windows Package Manager)..." "Yellow"
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "winget isn't available. Install Node.js LTS from https://nodejs.org, then run Install.cmd again." }
    winget install -e --id OpenJS.NodeJS.LTS --source winget
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js didn't finish installing. Install Node.js LTS from https://nodejs.org, then run Install.cmd again." }
  }
  Say "Node.js $(node --version) found." "Green"

  # 2. App packages
  Say "Installing app packages (this can take a minute)..."
  Push-Location $dir
  & npm.cmd install --no-audit --no-fund 2>&1 | ForEach-Object { Add-Content $log $_ }
  $npmExit = $LASTEXITCODE
  Pop-Location
  if ($npmExit -ne 0) { throw "npm install failed (details in data\install.log)" }
  Say "Packages installed." "Green"

  # 3. Browser (Microsoft Edge ships with Windows 10/11)
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) { Say "Microsoft Edge found." "Green" } else { throw "Microsoft Edge wasn't found. Install it from https://www.microsoft.com/edge, then run Install.cmd again." }

  # 4. Claude Code CLI (the user supplies it; the app can't work without it)
  $claude = Find-Claude
  if ($claude) { Say "Claude Code CLI found: $claude" "Green" }
  else {
    Say "Claude Code CLI wasn't found. Job Pilot uses it for all its analysis." "Yellow"
    Say "Install it from https://claude.com/claude-code . The app's first screen will check again and help you sign in." "Yellow"
  }

  # 5. Shortcuts (Desktop + Start menu)
  $ws = New-Object -ComObject WScript.Shell
  foreach ($folder in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
    $lnk = $ws.CreateShortcut((Join-Path $folder "Job Pilot.lnk"))
    $lnk.TargetPath = "wscript.exe"
    $lnk.Arguments = "`"$dir\launch.vbs`""
    $lnk.WorkingDirectory = $dir
    $lnk.IconLocation = if (Test-Path "$dir\icon.ico") { "$dir\icon.ico" } else { "shell32.dll,43" }
    $lnk.Description = "Job Pilot"
    $lnk.Save()
  }
  Say "Shortcuts created: 'Job Pilot' on your Desktop and in the Start menu." "Green"

  Say "Setup complete. Starting Job Pilot..." "Cyan"
  Start-Process wscript.exe "`"$dir\launch.vbs`""
  exit 0
}
catch {
  Say "SETUP FAILED: $($_.Exception.Message)" "Red"
  $claude = Find-Claude
  if ($claude) {
    $ans = Read-Host "Let Claude look at the problem and try to fix it? (Y/n)"
    if ($ans -ne "n") {
      Say "Asking Claude to fix the setup..." "Cyan"
      $prompt = "Job Pilot's Windows setup failed in the folder $dir. Read data\install.log and install.ps1, find the cause and fix it. " +
        "You may run npm.cmd, npx.cmd, node and winget commands and edit files in this folder. Don't change system settings. " +
        "Finish with 3 short lines: what was wrong, what you did, and whether the user should run Install.cmd again."
      Push-Location $dir
      & $claude -p $prompt --model opus --allowedTools "Read,Grep,Glob,Edit,Write,Bash(npm.cmd:*),Bash(npx.cmd:*),Bash(node:*),Bash(winget:*)"
      Pop-Location
    }
  }
  else { Say "Install the Claude Code CLI (https://claude.com/claude-code) and Node.js LTS (https://nodejs.org) if missing, then run Install.cmd again." "Yellow" }
  exit 1
}
