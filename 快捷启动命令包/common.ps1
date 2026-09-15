Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-CampusRoot([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  try {
    $full = [System.IO.Path]::GetFullPath($Path)
    $packageFile = Join-Path $full 'package.json'
    if (-not (Test-Path -LiteralPath $packageFile -PathType Leaf)) { return $false }
    $package = Get-Content -LiteralPath $packageFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return $package.name -eq 'campus-secretary-mvp' -and (Test-Path -LiteralPath (Join-Path $full '启动系统.cmd') -PathType Leaf)
  } catch { return $false }
}

function Find-CampusRoot {
  $scriptDirectory = Split-Path -Parent $PSCommandPath
  $candidates = New-Object System.Collections.Generic.List[string]
  $candidates.Add($scriptDirectory)
  $candidates.Add((Split-Path -Parent $scriptDirectory))
  $candidates.Add((Join-Path $scriptDirectory 'campus-secretary-mvp'))
  $configFile = Join-Path $scriptDirectory 'launcher.config.json'
  if (Test-Path -LiteralPath $configFile -PathType Leaf) {
    try {
      $config = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($config.projectRoot) { $candidates.Add([string]$config.projectRoot) }
    } catch { }
  }
  foreach ($candidate in $candidates) {
    if (Test-CampusRoot $candidate) { return [System.IO.Path]::GetFullPath($candidate) }
  }
  throw '没有找到校园教务小助手工程。请把“快捷启动命令包”文件夹放进系统根目录，或修改 launcher.config.json 中的 projectRoot。'
}

function Test-CampusReady {
  try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/v1/status' -TimeoutSec 2
    return $response.service -eq '校园教务小助手'
  } catch { return $false }
}
