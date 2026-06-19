param(
  [switch]$SkipBuild,
  [switch]$KillPortProcess,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir '..')
$port = 8788
$url = "http://localhost:$port/#/customer"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Find-Chrome {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

Write-Host "DiceCat Boardgame Ops - demo recording starter" -ForegroundColor Magenta
Write-Host "Tip: start your screen recorder first, then run this script."
Write-Host "The script builds the web app, starts the API server, and opens the customer page."
Write-Host "Project root: $root"

Set-Location $root

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($KillPortProcess) {
    Write-Step "Port $port is already in use; stopping PID $($listener.OwningProcess) $($process.ProcessName)"
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Seconds 1
  } else {
    Write-Host ""
    Write-Host "Port $port already has a running service: PID $($listener.OwningProcess) $($process.ProcessName)" -ForegroundColor Yellow
    Write-Host "To restart it, run again with: -KillPortProcess"
    if (-not $NoBrowser) {
      $browser = Find-Chrome
      if ($browser) {
        Start-Process $browser -ArgumentList @("--new-window", $url)
      } else {
        Start-Process $url
      }
    }
    exit 0
  }
}

if (-not $SkipBuild) {
  Write-Step "Build web app"
  npm run build -w web
}

Write-Step "Start API server"
$serverCommand = @"
Set-Location '$root\server'
`$env:SERVE_WEB='1'
npm run start
"@

Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $serverCommand) | Out-Null

Write-Step "Wait for service"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  Write-Host "The API server did not respond. Check the newly opened PowerShell server window for database errors." -ForegroundColor Yellow
  exit 1
}

Write-Host "Service is ready: http://localhost:$port" -ForegroundColor Green

if (-not $NoBrowser) {
  Write-Step "Open customer booking page"
  $browser = Find-Chrome
  if ($browser) {
    Start-Process $browser -ArgumentList @("--new-window", $url)
  } else {
    Start-Process $url
  }
}

Write-Host ""
Write-Host "Recording notes:" -ForegroundColor Magenta
Write-Host "1. Customer page: $url"
Write-Host "2. Admin login: http://localhost:$port/#/login"
Write-Host "3. Demo account: appleadmin / apple123"
Write-Host "4. Recording script and feature doc: docs/demo"
