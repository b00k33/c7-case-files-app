# C7 Case Files - Windows local server, no installs required.
# Serves this folder on http://localhost:8777 using .NET's HttpListener,
# which ships with every Windows PowerShell install. Used by start.bat.

$Root = $PSScriptRoot
$Port = 8777

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
} catch {
    Write-Host "Could not start the server on port $Port - it may already be running."
    Write-Host "If C7 Case Files is already open in your browser, you're all set."
    Start-Sleep -Seconds 4
    exit
}

Write-Host "C7 Case Files is running at http://localhost:$Port"
Write-Host "Leave this window open while you use the app. Close it to stop."

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "application/javascript"; ".mjs" = "application/javascript"
  ".css" = "text/css"; ".json" = "application/json"; ".wasm" = "application/wasm"
  ".sql" = "text/plain"; ".md" = "text/plain"; ".png" = "image/png"; ".svg" = "image/svg+xml"
  ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".pdf" = "application/pdf"; ".mp4" = "video/mp4"
  ".webm" = "video/webm"; ".ico" = "image/x-icon"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $full = Join-Path $Root ($path.TrimStart("/"))
    $full = [System.IO.Path]::GetFullPath($full)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($Root))) {
      $res.StatusCode = 403; $res.Close(); continue
    }
    if (Test-Path $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $res.ContentType = $ct
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
  } finally {
    $res.Close()
  }
}
