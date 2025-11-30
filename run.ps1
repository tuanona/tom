$backend = Start-Process -FilePath ".\server\server.exe" -PassThru
Write-Host "Backend started with PID: $($backend.Id)"

Set-Location "client"
$frontend = Start-Process -FilePath "C:\Users\Latif\.bun\bin\bun.exe" -ArgumentList "run dev" -PassThru
Write-Host "Frontend started with PID: $($frontend.Id)"

Write-Host "Press any key to stop..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Process -Id $backend.Id -Force
Stop-Process -Id $frontend.Id -Force
Write-Host "Stopped."
