@echo off
REM open_local.bat - start a static server for the portfolio and open it in the browser (Windows).
cd /d "%~dp0"
set PORT=5199
where py >nul 2>nul && (set PY=py) || (set PY=python)
start "" http://localhost:%PORT%/
echo Serving at http://localhost:%PORT%/  (close this window to stop)
%PY% -m http.server %PORT% --bind 127.0.0.1
