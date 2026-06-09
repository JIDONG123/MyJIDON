# 课程-教学班增量（Phase 1~6）本地验证：后端模块加载 + 前端构建
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Backend module smoke test"
Push-Location (Join-Path $root 'backend')
node -e @"
require('./utils/taskGradingContext');
require('./utils/practiceStatsScope');
require('./controllers/dashboardController');
require('./controllers/analyticsController');
require('./controllers/exportController');
require('./controllers/reportController');
console.log('backend modules OK');
"@
Pop-Location

Write-Host "==> Frontend production build"
Push-Location (Join-Path $root 'frontend')
npm run build
Pop-Location

Write-Host "==> All checks passed"
