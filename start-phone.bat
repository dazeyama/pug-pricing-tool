@echo off
REM Start PUG Pricing Tool for the phone scanner (docs/SCAN_FUNCTION.md 11.1):
REM the dev server over HTTPS on the shop's Wi-Fi (npm run dev:lan), so a phone's
REM camera works. Dev Supabase project, like start.bat. SPACE stops it.
cd /d "%~dp0"
echo Starting PUG Pricing Tool for phone scanning on port 5180 (HTTPS) ...

REM Node's installer adds itself to PATH, but a window opened before the install won't see it.
where npm >nul 2>&1 || set "PATH=%ProgramFiles%\nodejs;%PATH%"

REM Free the port first: start.bat's server (localhost only) or a previous one.
call "%~dp0stop.bat" >nul 2>&1

if not exist node_modules (
    echo Installing packages, first run only...
    call npm install
)

REM This laptop's address on the network it's connected to (the one with a gateway).
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "LANIP=%%i"

start "pug-pricing-tool (phone)" cmd /c "npm run dev:lan"
timeout /t 3 /nobreak >nul
start "" "https://localhost:5180/"
echo.
echo PUG Pricing Tool is running over HTTPS for phone scanning.
echo.
echo   This laptop:  https://localhost:5180/        (open the Price tab or a collection)
if defined LANIP (
    echo   The phone:    https://%LANIP%:5180/#/scan
) else (
    echo   The phone:    https://^<this laptop's Wi-Fi address^>:5180/#/scan   (ipconfig shows it^)
)
echo.
echo The phone must be on the same Wi-Fi. Both browsers warn about the certificate once:
echo Chrome: Advanced, then Proceed. Safari: Show Details, then visit this website.
echo If Windows Firewall asks about Node.js, allow it on private networks.
echo.
echo Press SPACE to end program.

:wait
powershell -NoProfile -Command "while($true){ $k=[Console]::ReadKey($true).Key; if($k -eq 'Spacebar'){exit 0} }"

:stop
echo.
echo Stopping...
call "%~dp0stop.bat"
