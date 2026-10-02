<#
.SYNOPSIS
  Installs PrismMCP on Windows and registers it with Claude Code / Claude Desktop.

.DESCRIPTION
  1. Checks for Node.js 18+ (offers to install Node LTS via winget if missing).
  2. Downloads PrismMCP (git clone if git is available, otherwise a GitHub zip)
     into %LOCALAPPDATA%\PrismMCP, or updates it if already installed.
  3. Installs dependencies and builds it.
  4. Auto-detects your PrismLauncher install + data folder (or uses -PrismDir / -PrismExe).
  5. Registers the MCP server with Claude Code (if `claude` is on PATH) and
     Claude Desktop (if installed), then runs a self-check.

  Safe to re-run: re-running updates PrismMCP and refreshes the registrations.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

.EXAMPLE
  # Portable / non-standard Prism install:
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -PrismExe "D:\Games\PrismLauncher\prismlauncher.exe" -PrismDir "D:\Games\PrismLauncher"
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "PrismMCP"),
    [string]$PrismDir = "",
    [string]$PrismExe = "",
    [string]$Branch = "master",
    [switch]$SkipClaudeCode,
    [switch]$SkipClaudeDesktop,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/benflwrs/PrismMCP"
$ServerName = "prismmcp"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Fail($msg)       { Write-Host "`n[FAILED] $msg" -ForegroundColor Red; exit 1 }

function Test-Command($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Update-SessionPath {
    # Pick up PATH changes made by installers (winget) without reopening the terminal.
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Confirm-Action($question) {
    if ($Yes) { return $true }
    $answer = Read-Host "$question [Y/n]"
    return ($answer -eq "" -or $answer -match "^[Yy]")
}

# Run a native command; throw if it exits non-zero (PowerShell doesn't do this by itself).
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [string]$What)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE)." }
}

Write-Host "PrismMCP Windows installer" -ForegroundColor Magenta
Write-Host "Install folder: $InstallDir"

# ---------------------------------------------------------------- 1. Node.js
Write-Step "Checking Node.js (need v18 or newer)"
if (-not (Test-Command "node")) {
    Write-Warn2 "Node.js is not installed."
    if ((Test-Command "winget") -and (Confirm-Action "Install Node.js LTS now using winget?")) {
        Invoke-Native "winget" @("install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-source-agreements", "--accept-package-agreements") "winget install Node.js"
        Update-SessionPath
    }
    if (-not (Test-Command "node")) {
        Fail "Node.js still not found. Install the LTS version from https://nodejs.org, then open a NEW PowerShell window and re-run this script."
    }
}
$nodeVersion = (& node --version).Trim()
$nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 18) {
    Fail "Node.js $nodeVersion is too old (need v18+). Update from https://nodejs.org (or: winget upgrade OpenJS.NodeJS.LTS) and re-run."
}
$nodeExe = (Get-Command node).Source
Write-Ok "Node.js $nodeVersion at $nodeExe"
if (-not (Test-Command "npm")) { Fail "npm not found (it normally ships with Node.js). Reinstall Node.js LTS from https://nodejs.org." }

# ---------------------------------------------------------------- 2. Download / update
Write-Step "Downloading PrismMCP"
$isGitCheckout = Test-Path (Join-Path $InstallDir ".git")
if ($isGitCheckout -and (Test-Command "git")) {
    Push-Location $InstallDir
    try {
        Invoke-Native "git" @("fetch", "--quiet", "origin", $Branch) "git fetch"
        Invoke-Native "git" @("checkout", "--quiet", $Branch) "git checkout"
        Invoke-Native "git" @("reset", "--quiet", "--hard", "origin/$Branch") "git reset"
    } finally { Pop-Location }
    Write-Ok "Updated existing git checkout"
} elseif (Test-Command "git") {
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    Invoke-Native "git" @("clone", "--quiet", "--branch", $Branch, "$RepoUrl.git", $InstallDir) "git clone"
    Write-Ok "Cloned $RepoUrl"
} else {
    # No git: grab the branch as a zip from GitHub.
    $tmpZip = Join-Path $env:TEMP "prismmcp-$Branch.zip"
    $tmpExtract = Join-Path $env:TEMP "prismmcp-extract"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"   # makes Invoke-WebRequest much faster on PS 5.1
    Invoke-WebRequest -Uri "$RepoUrl/archive/refs/heads/$Branch.zip" -OutFile $tmpZip -UseBasicParsing
    if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
    $inner = Get-ChildItem $tmpExtract -Directory | Select-Object -First 1
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir) | Out-Null
    Move-Item $inner.FullName $InstallDir
    Remove-Item -Force $tmpZip; Remove-Item -Recurse -Force $tmpExtract
    Write-Ok "Downloaded zip from GitHub (git not installed - re-run this script to update)"
}

# ---------------------------------------------------------------- 3. Build
Write-Step "Installing dependencies and building (takes a minute)"
Push-Location $InstallDir
try {
    if (Test-Path "package-lock.json") {
        Invoke-Native "npm" @("ci", "--no-audit", "--no-fund", "--loglevel=error") "npm ci"
    } else {
        Invoke-Native "npm" @("install", "--no-audit", "--no-fund", "--loglevel=error") "npm install"
    }
    Invoke-Native "npm" @("run", "build", "--silent") "npm run build"
} finally { Pop-Location }
$serverJs = Join-Path (Join-Path $InstallDir "dist") "server.js"
if (-not (Test-Path $serverJs)) { Fail "Build finished but $serverJs is missing." }
Write-Ok "Built $serverJs"

# ---------------------------------------------------------------- 4. Detect PrismLauncher
Write-Step "Locating PrismLauncher"
if ($PrismExe) { $env:PRISM_EXECUTABLE = $PrismExe }
if ($PrismDir) { $env:PRISM_DIR = $PrismDir }
$detectedJson = & node $serverJs --print-config
if ($LASTEXITCODE -ne 0) { Fail "Could not run PrismMCP to detect PrismLauncher paths." }
$detected = $detectedJson | ConvertFrom-Json
$PrismExe = $detected.executable
$PrismDir = $detected.dataDir

if (-not [IO.Path]::IsPathRooted($PrismExe) -or -not (Test-Path $PrismExe)) {
    $onPath = Get-Command "prismlauncher.exe" -ErrorAction SilentlyContinue
    if ($onPath) {
        $PrismExe = $onPath.Source
    } else {
        Write-Warn2 "Couldn't find prismlauncher.exe automatically."
        $entered = Read-Host "    Paste the full path to prismlauncher.exe (or press Enter to skip; launching won't work until set)"
        if ($entered) { $PrismExe = $entered.Trim('"') }
    }
}
if (-not (Test-Path $PrismDir)) {
    Write-Warn2 "PrismLauncher data folder not found at $PrismDir"
    Write-Warn2 "If you've never opened PrismLauncher, open it once then re-run this script."
    $entered = Read-Host "    Or paste your PrismLauncher data folder path (the one containing 'instances'), Enter to keep default"
    if ($entered) { $PrismDir = $entered.Trim('"') }
}
Write-Ok "Executable: $PrismExe"
Write-Ok "Data folder: $PrismDir"
$env:PRISM_EXECUTABLE = $PrismExe
$env:PRISM_DIR = $PrismDir

# ---------------------------------------------------------------- 5a. Claude Code
$registered = @()
if (-not $SkipClaudeCode) {
    Write-Step "Registering with Claude Code"
    if (Test-Command "claude") {
        # Remove any previous registration so re-runs refresh paths. "Not found" on first
        # install is expected; swallow it (PS 5.1 turns native stderr into terminating errors under Stop).
        $prevEap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        try { & claude mcp remove $ServerName -s user *> $null } catch { }
        $ErrorActionPreference = $prevEap
        Invoke-Native "claude" @("mcp", "add", "-s", "user", $ServerName,
            "-e", "PRISM_DIR=$PrismDir", "-e", "PRISM_EXECUTABLE=$PrismExe",
            "--", $nodeExe, $serverJs) "claude mcp add"
        Write-Ok "Added '$ServerName' to Claude Code (user scope)"
        $registered += "Claude Code"
    } else {
        Write-Warn2 "'claude' CLI not found - skipping. (Re-run this script after installing Claude Code.)"
    }
}

# ---------------------------------------------------------------- 5b. Claude Desktop
if (-not $SkipClaudeDesktop) {
    Write-Step "Registering with Claude Desktop"
    $desktopDir = Join-Path $env:APPDATA "Claude"
    if (Test-Path $desktopDir) {
        $cfgPath = Join-Path $desktopDir "claude_desktop_config.json"
        $config = [pscustomobject]@{}
        if (Test-Path $cfgPath) {
            $raw = Get-Content $cfgPath -Raw
            if ($raw.Trim()) {
                Copy-Item $cfgPath "$cfgPath.bak" -Force
                $config = $raw | ConvertFrom-Json
            }
        }
        if (-not ($config.PSObject.Properties.Name -contains "mcpServers")) {
            $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([pscustomobject]@{})
        }
        $entry = [pscustomobject]@{
            command = $nodeExe
            args    = @($serverJs)
            env     = [pscustomobject]@{ PRISM_DIR = $PrismDir; PRISM_EXECUTABLE = $PrismExe }
        }
        $config.mcpServers | Add-Member -NotePropertyName $ServerName -NotePropertyValue $entry -Force
        # Write UTF-8 *without* BOM (PS 5.1's -Encoding UTF8 adds a BOM some JSON parsers reject).
        [IO.File]::WriteAllText($cfgPath, ($config | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
        Write-Ok "Updated $cfgPath (backup: .bak). Fully quit and reopen Claude Desktop to load it."
        $registered += "Claude Desktop"
    } else {
        Write-Warn2 "Claude Desktop not found - skipping."
    }
}

# ---------------------------------------------------------------- 6. Self-check
Write-Step "Running self-check"
& node $serverJs --check
$checkOk = ($LASTEXITCODE -eq 0)

Write-Host ""
if ($checkOk) { Write-Host "PrismMCP installed successfully." -ForegroundColor Green }
else { Write-Host "PrismMCP installed, but the self-check reported a problem (see [FAIL] lines above)." -ForegroundColor Yellow }
if ($registered.Count -gt 0) {
    Write-Host "Registered with: $($registered -join ', ')"
} else {
    Write-Host "Not registered with any client. Add this to your MCP client config manually:" -ForegroundColor Yellow
}
Write-Host "`nManual MCP config (for any other client):"
$manual = [pscustomobject]@{ mcpServers = [pscustomobject]@{ $ServerName = [pscustomobject]@{
    command = $nodeExe; args = @($serverJs)
    env = [pscustomobject]@{ PRISM_DIR = $PrismDir; PRISM_EXECUTABLE = $PrismExe } } } }
Write-Host ($manual | ConvertTo-Json -Depth 20)
Write-Host "`nTo update later, just run this script again."
if (-not $checkOk) { exit 1 }
