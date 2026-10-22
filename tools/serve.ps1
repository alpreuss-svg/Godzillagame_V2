# Mini-Webserver zum lokalen Testen: powershell -ExecutionPolicy Bypass -File tools\serve.ps1
param([int]$Port = 8123)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css'; '.png' = 'image/png'; '.md' = 'text/plain; charset=utf-8'; '.ico' = 'image/x-icon'; '.webmanifest' = 'application/manifest+json'; '.json' = 'application/json' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Server laeuft: http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
  if ($p -eq '') { $p = 'index.html' }
  $f = Join-Path $root $p
  if ((Test-Path $f -PathType Leaf) -and ([IO.Path]::GetFullPath($f).StartsWith($root))) {
    $b = [IO.File]::ReadAllBytes($f)
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $c.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $c.Response.Headers.Add('Cache-Control', 'no-store')
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
