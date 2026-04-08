@echo off
setlocal

pushd "%~dp0" >nul
if errorlevel 1 (
  echo Failed to access project directory.
  exit /b 1
)

echo Running TypeScript check...
node node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json
if errorlevel 1 (
  echo.
  echo TypeScript check failed.
  popd >nul
  exit /b 1
)

echo.
echo Building Vite preview bundle...
node node_modules\vite\bin\vite.js build
if errorlevel 1 (
  echo.
  echo Build failed.
  popd >nul
  exit /b 1
)

echo.
echo Rebuild complete.
echo Refresh http://localhost:4173/

popd >nul
exit /b 0
