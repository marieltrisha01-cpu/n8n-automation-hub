# ─────── Created: 2026-11-14 | Purpose: Safe Interactive Installer for Official Render MCP Server (https://mcp.render.com/mcp) | Last verified with: PowerShell 5.1 / Node v25.6.1 ───────
# Run with AI CLI: [powershell -ExecutionPolicy Bypass -File .\scripts\install-render-mcp.ps1]

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$McpConfigPath = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
$EnvLocalPath = Join-Path $ProjectRoot ".env.local"
$NodeUpdater = Join-Path $PSScriptRoot "install-render-mcp.mjs"

Write-Host "`n=== Render MCP Server Installer ===" -ForegroundColor Cyan

# Check clipboard first so user does not even have to paste if rnd_... is already copied
$token = ""
try {
  $clip = (Get-Clipboard -Raw -ErrorAction SilentlyContinue)
  if ($clip) { $clip = $clip.Trim() }
  if ($clip -match '^rnd_[A-Za-z0-9_-]{12,}$') {
    $token = $clip
    Write-Host "[OK] Detected Render API key (rnd_...) in clipboard." -ForegroundColor Green
  }
} catch {
  # Ignore clipboard errors in non-interactive hosts
}

if (-not $token) {
  $token = Read-Host "Paste your Render API Key (rnd_...) and press ENTER"
  if ($token) { $token = $token.Trim() }
  # Wipe visible prompt line from terminal buffer for safety
  try { Clear-Host } catch {}
  Write-Host "=== Render MCP Server Installer ===" -ForegroundColor Cyan
}

if (-not $token -or $token.Length -lt 16) {
  Write-Host "[ERROR] No valid Render API key provided. Copy your rnd_... key from Render Account Settings -> API Keys and try again." -ForegroundColor Red
  exit 1
}

[Environment]::SetEnvironmentVariable("RENDER_API_KEY_TMP", $token, "Process")
[Environment]::SetEnvironmentVariable("MCP_CONFIG_PATH_TMP", $McpConfigPath, "Process")
[Environment]::SetEnvironmentVariable("ENV_LOCAL_PATH_TMP", $EnvLocalPath, "Process")

try {
  & node $NodeUpdater
  if ($LASTEXITCODE -ne 0) {
    throw "Node updater exited with code $LASTEXITCODE"
  }
  Write-Host "`n[SUCCESS] Render MCP Server configured! Restart/reload Antigravity to load Neon + Render MCP." -ForegroundColor Green
} finally {
  [Environment]::SetEnvironmentVariable("RENDER_API_KEY_TMP", $null, "Process")
  [Environment]::SetEnvironmentVariable("MCP_CONFIG_PATH_TMP", $null, "Process")
  [Environment]::SetEnvironmentVariable("ENV_LOCAL_PATH_TMP", $null, "Process")
  $token = $null
}
