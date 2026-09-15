param(
  [switch]$NoBrowser,
  [switch]$HiddenService
)
. (Join-Path $PSScriptRoot 'common.ps1')
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = Find-CampusRoot

if (Test-CampusReady) {
  Write-Host '校园教务小助手已经在运行。' -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8080/' }
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '没有找到 Node.js。请先安装 Node.js 22.16 或更高版本。'
}

$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { throw "当前 Node.js 主版本为 $major，本版至少需要 Node.js 22.16。" }

$localDirectory = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
$serviceScript = Join-Path $PSScriptRoot 'service-host.ps1'
$arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$serviceScript`" -ProjectRoot `"$projectRoot`""
$windowStyle = if ($HiddenService) { 'Hidden' } else { 'Normal' }
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle $windowStyle -PassThru
@{ pid=$process.Id; projectRoot=$projectRoot; serviceScript=$serviceScript; startedAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localDirectory 'quick-launch.json') -Encoding UTF8

Write-Host '正在启动校园教务小助手…'
$ready = $false
for ($index = 0; $index -lt 90; $index++) {
  Start-Sleep -Seconds 1
  if (Test-CampusReady) { $ready = $true; break }
  if ($process.HasExited) { break }
}

if (-not $ready) {
  throw '系统未能在 90 秒内就绪。请查看刚打开的服务窗口，按照其中提示处理。'
}

Write-Host '系统已经就绪：http://127.0.0.1:8080' -ForegroundColor Green
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8080/' }
