# 아카데미 스킨용 축소 이미지 생성: characters/Uxx/{sd,portrait}.png → public/skins/academy/{sd,portrait}/Uxx.png
# 원화(1~3MB)를 게임에서 그대로 쓰면 무거우므로 전투 SD 256px, 상점 초상화 128px로 줄여 둔다.
# 사용: powershell -ExecutionPolicy Bypass -File tools/skin-assets.ps1  (Windows PowerShell 5.1, 추가 설치 없음)
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$targets = @(
  @{ Kind = 'sd'; Size = 256 },
  @{ Kind = 'portrait'; Size = 128 }
)

foreach ($target in $targets) {
  $outDir = Join-Path $root "public/skins/academy/$($target.Kind)"
  New-Item -ItemType Directory -Force $outDir | Out-Null
  for ($n = 1; $n -le 30; $n++) {
    $code = 'U{0:D2}' -f $n
    $src = Join-Path $root "characters/$code/$($target.Kind).png"
    if (-not (Test-Path $src)) { Write-Warning "없음: $src"; continue }
    $image = [System.Drawing.Image]::FromFile($src)
    try {
      $size = $target.Size
      $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      # 정사각형이 아니면 긴 변 기준으로 맞추고 가운데 정렬 (투명 여백)
      $scale = [Math]::Min($size / $image.Width, $size / $image.Height)
      $w = [int]($image.Width * $scale); $h = [int]($image.Height * $scale)
      $graphics.DrawImage($image, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
      $graphics.Dispose()
      $bitmap.Save((Join-Path $outDir "$code.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Dispose()
    } finally {
      $image.Dispose()
    }
  }
}
Write-Output '완료: public/skins/academy'
