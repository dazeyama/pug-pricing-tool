@echo off
REM Stop the PUG Pricing Tool dev server and free port 5180.
set "FOUND="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180 " ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
    set "FOUND=1"
)
if defined FOUND (
    echo Stopped pug-pricing-tool and freed port 5180.
) else (
    echo Nothing was listening on port 5180.
)
