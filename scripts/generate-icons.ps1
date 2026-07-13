# Generates Android launcher icons (legacy square + round) for kiosk and
# employee apps from logolar/uygulama_logo-removebg-preview.png.
# Logo is drawn centered on a white background (GDI+ / System.Drawing).
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$logoPath = Join-Path $root "logolar\uygulama_logo-removebg-preview.png"
$logo = [System.Drawing.Image]::FromFile($logoPath)

$densities = @(
    @{ dir = "mipmap-mdpi";    size = 48  },
    @{ dir = "mipmap-hdpi";    size = 72  },
    @{ dir = "mipmap-xhdpi";   size = 96  },
    @{ dir = "mipmap-xxhdpi";  size = 144 },
    @{ dir = "mipmap-xxxhdpi"; size = 192 }
)
$apps = @(
    (Join-Path $root "apps\kiosk\android\app\src\main\res"),
    (Join-Path $root "apps\employee\android\app\src\main\res")
)

function New-Icon([int]$size, [bool]$round, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($round) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $size, $size)
        $g.SetClip($path)
    }
    $g.FillRectangle([System.Drawing.Brushes]::White, 0, 0, $size, $size)

    # logo occupies 86% of the canvas, centered
    $inner = [int]($size * 0.86)
    $offset = [int](($size - $inner) / 2)
    $g.DrawImage($logo, $offset, $offset, $inner, $inner)

    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

foreach ($app in $apps) {
    foreach ($d in $densities) {
        $dir = Join-Path $app $d.dir
        New-Item -ItemType Directory -Force $dir | Out-Null
        New-Icon $d.size $false (Join-Path $dir "ic_launcher.png")
        New-Icon $d.size $true  (Join-Path $dir "ic_launcher_round.png")
        Write-Output "$dir -> $($d.size)px"
    }
}
$logo.Dispose()
Write-Output "Done."
