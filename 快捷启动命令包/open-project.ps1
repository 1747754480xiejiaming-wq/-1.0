. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Find-CampusRoot
Start-Process explorer.exe -ArgumentList ('"' + $projectRoot + '"')
