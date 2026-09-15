. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Find-CampusRoot
$credentialFile = Join-Path $projectRoot '.local/首次登录.txt'
if (-not (Test-Path -LiteralPath $credentialFile -PathType Leaf)) { throw '尚未生成登录信息。请先双击“一键启动并打开.cmd”。' }
Start-Process notepad.exe -ArgumentList ('"' + $credentialFile + '"')
