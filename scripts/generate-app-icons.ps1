# SEFPOS uygulama ikonlarını tek bir kaynak PNG'den üretir.
# - public/logo.png (256), public/logo256.png (256), public/SEFPOS.png (512)
# - public/SEFPOS.ico (16,24,32,48,64,128,256 PNG-encoded multi-res)
# Kullanim: pwsh ./scripts/generate-app-icons.ps1 -Source ./public/SEFPOS-source.png

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) { throw "Kaynak bulunamadi: $Source" }

$publicDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
if (-not (Test-Path $publicDir)) { throw "public/ bulunamadi: $publicDir" }

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
try {
    function Save-Resized([int]$size, [string]$outPath) {
        $bmp = New-Object System.Drawing.Bitmap $size, $size
        try {
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $g.Clear([System.Drawing.Color]::Transparent)
                $g.DrawImage($src, 0, 0, $size, $size)
            } finally { $g.Dispose() }
            $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $bmp.Dispose() }
    }

    function Get-PngBytes([int]$size) {
        $bmp = New-Object System.Drawing.Bitmap $size, $size
        try {
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $g.Clear([System.Drawing.Color]::Transparent)
                $g.DrawImage($src, 0, 0, $size, $size)
            } finally { $g.Dispose() }
            $ms = New-Object System.IO.MemoryStream
            try {
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                return $ms.ToArray()
            } finally { $ms.Dispose() }
        } finally { $bmp.Dispose() }
    }

    Write-Host "PNG varyantlari yaziliyor..."
    Save-Resized 256 (Join-Path $publicDir 'logo.png')
    Save-Resized 256 (Join-Path $publicDir 'logo256.png')
    Save-Resized 512 (Join-Path $publicDir 'SEFPOS.png')

    $iconSizes = @(16, 24, 32, 48, 64, 128, 256)
    Write-Host ("ICO uretiliyor: {0}" -f ($iconSizes -join ','))
    $images = New-Object 'System.Collections.Generic.List[byte[]]'
    foreach ($s in $iconSizes) { $images.Add((Get-PngBytes $s)) }

    # ICONDIR (6) + ICONDIRENTRY * N (16) + payloads
    $count = $images.Count
    $headerLen = 6 + (16 * $count)
    $payloadLen = 0
    foreach ($img in $images) { $payloadLen += $img.Length }
    $totalLen = $headerLen + $payloadLen

    $buf = New-Object byte[] $totalLen
    [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint16]0), 0, $buf, 0, 2)  # Reserved
    [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint16]1), 0, $buf, 2, 2)  # Type=1 (ICO)
    [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint16]$count), 0, $buf, 4, 2)

    $offset = $headerLen
    for ($i = 0; $i -lt $count; $i++) {
        $sz = $iconSizes[$i]
        $entry = 6 + ($i * 16)
        $w = if ($sz -ge 256) { 0 } else { $sz }
        $h = $w
        $buf[$entry + 0] = [byte]$w
        $buf[$entry + 1] = [byte]$h
        $buf[$entry + 2] = 0       # ColorCount
        $buf[$entry + 3] = 0       # Reserved
        [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint16]1), 0, $buf, $entry + 4, 2)   # Planes
        [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint16]32), 0, $buf, $entry + 6, 2)  # BitCount
        [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint32]$images[$i].Length), 0, $buf, $entry + 8, 4)
        [System.Buffer]::BlockCopy([BitConverter]::GetBytes([uint32]$offset), 0, $buf, $entry + 12, 4)
        [System.Buffer]::BlockCopy($images[$i], 0, $buf, $offset, $images[$i].Length)
        $offset += $images[$i].Length
    }

    $icoPath = Join-Path $publicDir 'SEFPOS.ico'
    [System.IO.File]::WriteAllBytes($icoPath, $buf)
    Write-Host ("Yazildi: {0} ({1} bayt)" -f $icoPath, (Get-Item $icoPath).Length)
} finally {
    $src.Dispose()
}

Write-Host "Tamam: public/{logo.png, logo256.png, SEFPOS.png, SEFPOS.ico} guncellendi."
