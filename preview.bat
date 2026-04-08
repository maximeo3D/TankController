@echo off
setlocal

pushd "%~dp0" >nul
if errorlevel 1 (
  echo Failed to access project directory.
  exit /b 1
)

echo Starting Vite preview server on http://localhost:4173/
echo Press Ctrl+C to stop the server.
echo.

node node_modules\vite\bin\vite.js preview --host 0.0.0.0 --port 4173

popd >nul
exit /b %errorlevel%
