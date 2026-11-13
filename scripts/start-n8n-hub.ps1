# ─────── Created: 2026-11-14 | Purpose: 1-Click Local n8n Hub Launcher with Neon Cloud Postgres & Cloudflare Tunnel | Last verified with: PowerShell / Node v25.6.1 ───────
# Run with AI CLI: [powershell -ExecutionPolicy Bypass -File .\scripts\start-n8n-hub.ps1]

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFiles = @(
  (Join-Path $ProjectRoot ".env.local"),
  (Join-Path $ProjectRoot ".env")
)

function Import-EnvFileSilently {
  param([string]$FilePath)
  if (-not (Test-Path $FilePath)) { return }
  foreach ($line in Get-Content $FilePath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $val = $trimmed.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if ($val) {
      [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
}

foreach ($f in $EnvFiles) {
  Import-EnvFileSilently -FilePath $f
}

# Auto-generate and persist N8N_ENCRYPTION_KEY in .env.local if missing (never printed)
if (-not $env:N8N_ENCRYPTION_KEY) {
  $generatedKey = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
  [Environment]::SetEnvironmentVariable("N8N_ENCRYPTION_KEY", $generatedKey, "Process")
  $envLocalPath = Join-Path $ProjectRoot ".env.local"
  Add-Content -Path $envLocalPath -Value "`nN8N_ENCRYPTION_KEY=$generatedKey" -Encoding UTF8
  Write-Host "[OK] Generated and saved N8N_ENCRYPTION_KEY to .env.local (hidden)." -ForegroundColor Green
}

# Prefer DATABASE_URL_UNPOOLED (Neon direct connection) -> fallback to DATABASE_URL
$neonConn = $env:DATABASE_URL_UNPOOLED
if (-not $neonConn) { $neonConn = $env:DATABASE_URL }

if ($neonConn) {
  $parsedJson = node -e "
    const u = new URL(process.argv[1]);
    console.log(JSON.stringify({
      host: u.hostname,
      port: u.port || '5432',
      db: u.pathname.replace(/^\//, ''),
      user: decodeURIComponent(u.username),
      pass: decodeURIComponent(u.password)
    }));
  " $neonConn
  $pg = $parsedJson | ConvertFrom-Json
  $env:DB_TYPE = "postgresdb"
  $env:DB_POSTGRESDB_HOST = $pg.host
  $env:DB_POSTGRESDB_PORT = $pg.port
  $env:DB_POSTGRESDB_DATABASE = $pg.db
  $env:DB_POSTGRESDB_USER = $pg.user
  $env:DB_POSTGRESDB_PASSWORD = $pg.pass
  $env:DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED = "false"
  Write-Host "[OK] Connected n8n storage to Neon PostgreSQL ($($pg.host))." -ForegroundColor Cyan
} else {
  Write-Host "[WARN] DATABASE_URL_UNPOOLED / DATABASE_URL not found; using local SQLite." -ForegroundColor Yellow
}

if (-not $env:N8N_PORT) { $env:N8N_PORT = "5678" }
if (-not $env:GENERIC_TIMEZONE) { $env:GENERIC_TIMEZONE = "Asia/Manila" }
$env:N8N_DIAGNOSTICS_ENABLED = "false"
$env:N8N_PERSONALIZATION_ENABLED = "false"

Write-Host "[START] Launching n8n Multi-Project Hub on http://localhost:$($env:N8N_PORT)" -ForegroundColor Green
npx --yes n8n start
