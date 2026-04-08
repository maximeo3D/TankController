@echo off
setlocal

pushd "%~dp0" >nul
if errorlevel 1 (
  echo Failed to access project directory.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not available in PATH.
  echo Install Node.js, reopen your terminal, then retry.
  popd >nul
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available in PATH.
  echo Install Node.js including npm, reopen your terminal, then retry.
  popd >nul
  exit /b 1
)

if not exist "package.json" (
  echo package.json not found. Are you in the project root?
  popd >nul
  exit /b 1
)

if not exist "node_modules\" (
  echo node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    popd >nul
    exit /b 1
  )
)

if not exist "dist\" (
  echo dist folder not found. Building the project first...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    popd >nul
    exit /b 1
  )
)

echo Starting Vite preview server on http://localhost:4173/
echo Press Ctrl+C to stop the server.
echo.

call npm run preview -- --host 0.0.0.0 --port 4173

popd >nul
exit /b %errorlevel%
