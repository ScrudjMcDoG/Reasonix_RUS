@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
set "NODE="
for %%I in (node.exe) do if not defined NODE set "NODE=%%~$PATH:I"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE for /d %%D in ("%LOCALAPPDATA%\Author Software\nvm\installs\*") do if exist "%%D\node.exe" set "NODE=%%D\node.exe"
if not defined NODE for /d %%D in ("%APPDATA%\nvm\*") do if exist "%%D\node.exe" set "NODE=%%D\node.exe"
if not defined NODE (
  echo [ERROR] Node.js not found. Install Node.js LTS from https://nodejs.org and run again.
  pause
  exit /b 1
)
tasklist /fi "imagename eq Reasonix.exe" 2>nul | find /i "Reasonix.exe" >nul
if not errorlevel 1 (
  echo [WARN] Reasonix is running. Quit it completely ^(including the tray icon^) and run again.
  pause
  exit /b 1
)
"%NODE%" "%HERE%tools\russianize.mjs" check %*
echo.
pause