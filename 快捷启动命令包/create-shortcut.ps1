$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $PSScriptRoot '一键启动并打开.cmd'
$shortcutPath = Join-Path $desktop '校园教务小助手.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Description = '启动校园教务小助手并打开教师工作台'
$shortcut.Save()
Write-Host "桌面快捷方式已创建：$shortcutPath" -ForegroundColor Green
