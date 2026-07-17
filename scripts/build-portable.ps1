param(
  [switch]$SkipOfficialDownload
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = Join-Path $root 'dist'
$cache = Join-Path $root '.build-cache'
$packageName = 'Anime-Search-Windows-x64'
$stage = Join-Path $dist "$packageName-stage"
$packageRoot = Join-Path $stage $packageName
$zipPath = Join-Path $dist "$packageName.zip"
$zipHashPath = "$zipPath.sha256"

$expected = @{
  NodeExe = '9A4EB5F1C29C6A2E93852EAD46B999E284A6A5CA8BAB4D4E241D587D025A52DE'
  NodeZip = '0AE68406B42D7725661DA979B1403EC9926DA205C6770827F33AAC9D8F26E821'
  QbtExe = 'F69360AE8545A64F4FC84FB6BACEF03D77A6AA0793A4C14D4A28651CA26A27D1'
  QbtInstaller = 'FF508E2F912D59C9EABAF03633EBACFD45C2049F38DCAC027B8A7D7AD867AB2F'
  QbtSource = '7573621859DA7287BA708378EA9F5EB12F30962A1A7C28EBA5F44ECF8C4C114C'
}

function Assert-Hash([string]$Path, [string]$ExpectedHash) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required build file is missing: $Path"
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actual -ne $ExpectedHash) {
    throw "SHA-256 verification failed: $Path`nExpected: $ExpectedHash`nActual: $actual"
  }
}

function Remove-Safe([string]$Path) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $distPrefix = [System.IO.Path]::GetFullPath($dist).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a path outside dist: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) {
    for ($attempt = 1; $attempt -le 8; $attempt += 1) {
      try {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
        break
      } catch {
        if ($attempt -eq 8) { throw }
        Start-Sleep -Milliseconds 500
      }
    }
  }
}

function Get-OfficialFile([string]$Url, [string]$Destination, [string]$ExpectedHash) {
  if (Test-Path -LiteralPath $Destination) {
    try {
      Assert-Hash $Destination $ExpectedHash
      return
    } catch {
      Remove-Item -LiteralPath $Destination -Force
    }
  }
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
  Assert-Hash $Destination $ExpectedHash
}

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
  throw 'The portable package can only be built on 64-bit Windows.'
}

New-Item -ItemType Directory -Force -Path $dist, $cache | Out-Null

if (-not $SkipOfficialDownload) {
  Get-OfficialFile -Url 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-x64.zip' -Destination (Join-Path $cache 'node-v24.18.0-win-x64.zip') -ExpectedHash $expected.NodeZip
  Get-OfficialFile -Url 'https://downloads.sourceforge.net/project/qbittorrent/qbittorrent-win32/qbittorrent-5.2.3/qbittorrent_5.2.3_x64_setup.exe?download' -Destination (Join-Path $cache 'qbittorrent_5.2.3_x64_setup.exe') -ExpectedHash $expected.QbtInstaller
}

Assert-Hash (Join-Path $root 'vendor\node\node.exe') $expected.NodeExe
Assert-Hash (Join-Path $root 'vendor\qbittorrent\qbittorrent.exe') $expected.QbtExe
Assert-Hash (Join-Path $root 'sources\qbittorrent-5.2.3.tar.xz') $expected.QbtSource

$nodeVersion = & (Join-Path $root 'vendor\node\node.exe') --version
if ($nodeVersion.Trim() -ne 'v24.18.0') { throw "Bundled Node.js version mismatch: $nodeVersion" }
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\nyaapi') -PathType Container)) {
  throw 'Production dependencies are missing. Run npm ci --omit=dev in the maintenance environment first.'
}

Remove-Safe $stage
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $root 'app') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $root 'node_modules') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $root 'vendor') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $root 'licenses') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $root 'sources') -Destination $packageRoot -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'scripts\launch-app.js') -Destination (Join-Path $packageRoot 'scripts')

@(
  'package.json',
  'package-lock.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md'
) | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $root $_) -Destination $packageRoot
}

$launchers = @(Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Extension -in @('.vbs', '.cmd') })
if ($launchers.Count -ne 2) {
  throw "Expected exactly one VBS launcher and one CMD diagnostic launcher; found $($launchers.Count)."
}
$readme = Join-Path $root 'README.md'
if (-not (Test-Path -LiteralPath $readme -PathType Leaf)) {
  throw "Required README is missing: $readme"
}
$launchers + @($readme) | Copy-Item -Destination $packageRoot

Get-ChildItem -LiteralPath (Join-Path $packageRoot 'app') -Filter '*.test.js' -File | Remove-Item -Force
$nyaapiTests = Join-Path $packageRoot 'node_modules\nyaapi\test'
if (Test-Path -LiteralPath $nyaapiTests) {
  Remove-Item -LiteralPath $nyaapiTests -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'runtime'), (Join-Path $packageRoot 'licenses\npm') | Out-Null

$nodeModulesRoot = Join-Path $packageRoot 'node_modules'
Get-ChildItem -LiteralPath $nodeModulesRoot -Recurse -File | Where-Object {
  $_.Name -match '^(LICEN[CS]E|COPYING|NOTICE)(\..+)?$'
} | ForEach-Object {
  $relative = $_.FullName.Substring($nodeModulesRoot.Length + 1)
  $safeName = $relative -replace '[\\/:*?""<>|]', '__'
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageRoot "licenses\npm\$safeName") -Force
}

$manifestPath = Join-Path $packageRoot 'PORTABLE-MANIFEST.sha256'
$manifestLines = Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Where-Object {
  $_.FullName -ne $manifestPath
} | Sort-Object FullName | ForEach-Object {
  $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $relative"
}
[System.IO.File]::WriteAllLines($manifestPath, $manifestLines, [System.Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText($zipHashPath, "$zipHash  $packageName.zip`n", [System.Text.UTF8Encoding]::new($false))

Remove-Safe $stage
Write-Host "Portable package created: $zipPath"
Write-Host "SHA-256: $zipHash"
