# 원본을 보존하고 배포용 PNG만 축소한다.
param(
  [ValidateSet('academy', 'modern')][string]$Skin = 'academy',
  [switch]$AllowPartial
)
Add-Type -AssemblyName System.Drawing
$assetRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = if ($Skin -eq 'modern') { 'characters/modern' } else { 'characters' }
$exported = 0

function Export-SkinArt([string]$Code, [string]$Kind, [int]$Width, [int]$Height) {
  $source = Join-Path $assetRoot "$sourceRoot/$Code/$Kind.png"
  if (-not (Test-Path -LiteralPath $source)) {
    if ($AllowPartial) { return 0 }
    throw "Missing character art: $source"
  }
  $outDir = Join-Path $assetRoot "public/skins/$Skin/$Kind"
  New-Item -ItemType Directory -Force $outDir | Out-Null
  $image = [System.Drawing.Image]::FromFile($source)
  $bitmap = $null
  $graphics = $null
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $scale = [Math]::Min($Width / $image.Width, $Height / $image.Height)
    $scaledWidth = [int]($image.Width * $scale)
    $scaledHeight = [int]($image.Height * $scale)
    $graphics.DrawImage($image, [int](($Width - $scaledWidth) / 2), [int](($Height - $scaledHeight) / 2), $scaledWidth, $scaledHeight)
    $bitmap.Save((Join-Path $outDir "$Code.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    $image.Dispose()
  }
  return 1
}

for ($n = 1; $n -le 30; $n++) {
  $code = 'U{0:D2}' -f $n
  $exported += (Export-SkinArt $code 'sd' 256 256)
  $exported += (Export-SkinArt $code 'portrait' 256 256)
  $exported += (Export-SkinArt $code 'illustration' 384 576)
}
for ($n = 1; $n -le 3; $n++) {
  $code = 'C{0:D2}' -f $n
  $exported += (Export-SkinArt $code 'sd' 256 256)
  $exported += (Export-SkinArt $code 'portrait' 512 512)
  $exported += (Export-SkinArt $code 'illustration' 640 960)
}
Write-Output "Saved $exported game assets: public/skins/$Skin"
