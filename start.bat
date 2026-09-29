@echo off
REM Start PUG Pricing Tool (Vite dev server, dev Supabase project), open it, then wait for SPACE to stop.
cd /d "%~dp0"
echo Starting PUG Pricing Tool on http://localhost:5180 ...

REM Node's installer adds itself to PATH, but a window opened before the install won't see it.
where npm >nul 2>&1 || set "PATH=%ProgramFiles%\nodejs;%PATH%"

REM Free the port first in case a previous server is still running.
call "%~dp0stop.bat" >nul 2>&1

if not exist node_modules (
    echo Installing packages, first run only...
    call npm install
)

start "pug-pricing-tool" cmd /c "npm run dev -- --port 5180 --strictPort"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5180/"
echo.
echo PUG Pricing Tool is running at http://localhost:5180/
echo (Edits show up by themselves: Vite reloads the page.)
echo.
echo Press SPACE to end program.

:wait
powershell -NoProfile -Command "while($true){ $k=[Console]::ReadKey($true).Key; if($k -eq 'Spacebar'){exit 0} }"

:stop
echo.
echo Stopping...
call "%~dp0stop.bat"
