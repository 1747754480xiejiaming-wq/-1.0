param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$host.UI.RawUI.WindowTitle = '校园教务小助手 · 服务窗口（按 Ctrl+C 停止）'
Set-Location -LiteralPath $ProjectRoot
Write-Host '校园教务小助手服务窗口' -ForegroundColor Green
Write-Host '保持此窗口运行。需要停止时按 Ctrl+C，或双击命令包中的“停止系统.cmd”。'
Write-Host ''
$startCommand = Join-Path $ProjectRoot '启动系统.cmd'
& $startCommand
