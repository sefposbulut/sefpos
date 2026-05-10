Add-Type -AssemblyName System.Drawing
$paths = @('public\logo.png','public\logo256.png','public\SEFPOS.png')
foreach ($p in $paths) {
  if (Test-Path $p) {
    $img = [System.Drawing.Image]::FromFile((Resolve-Path $p))
    "{0}: {1}x{2}" -f $p, $img.Width, $img.Height
    $img.Dispose()
  }
}
