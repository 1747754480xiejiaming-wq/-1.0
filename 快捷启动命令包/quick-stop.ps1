. (Join-Path $PSScriptRoot 'common.ps1')
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = Find-CampusRoot
$recordFile = Join-Path $projectRoot '.local/quick-launch.json'

if (-not (Test-Path -LiteralPath $recordFile -PathType Leaf)) {
  if (Test-CampusReady) { throw '系统正在运行，但不是由本命令包启动。请在对应服务窗口按 Ctrl+C。' }
  Write-Host '系统当前没有运行。'
  exit 0
}

$record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$record.pid) -ErrorAction SilentlyContinue
if ($null -eq $process) {
  Remove-Item -LiteralPath $recordFile -Force
  Write-Host '系统进程已经结束。'
  exit 0
}

$expectedScript = [System.IO.Path]::GetFullPath([string]$record.serviceScript)
$expectedRoot = [System.IO.Path]::GetFullPath([string]$record.projectRoot)
$commandLine = [string]$process.CommandLine
if ($commandLine.IndexOf($expectedScript,[System.StringComparison]::OrdinalIgnoreCase) -lt 0 -or $commandLine.IndexOf($expectedRoot,[System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw '启动记录对应的进程身份不匹配，已拒绝停止。请在服务窗口按 Ctrl+C。'
}

Write-Host '正在停止校园教务小助手…'
$processId = [int]$record.pid
& taskkill.exe /PID $processId /T /F | Out-Null
Remove-Item -LiteralPath $recordFile -Force -ErrorAction SilentlyContinue
for ($index = 0; $index -lt 20 -and (Test-CampusReady); $index++) { Start-Sleep -Milliseconds 250 }
Write-Host '系统已停止。' -ForegroundColor Green
