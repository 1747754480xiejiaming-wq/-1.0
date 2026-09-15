@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请安装 Node.js 22 或 24 的长期支持版本，然后重新启动。
  pause
  exit /b 1
)
for /f %%v in ('node -p "parseInt(process.versions.node)"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
  echo 无法读取 Node.js 版本，请重新安装 Node.js 22 或 24 的长期支持版本。
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 22 (
  echo 当前 Node.js 主版本为 %NODE_MAJOR%，本版至少需要 Node.js 22.16。
  pause
  exit /b 1
)
if not exist "node_modules" (
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络。
    pause
    exit /b 1
  )
)
call npm start
pause
