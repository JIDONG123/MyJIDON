# 第四步：AI 批改旧接口 + 通知回归
# 用法: powershell -File scripts/run-regression-grading.ps1
# 可选 HTTP: $env:REGRESSION_HTTP='1'

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location (Join-Path $Root 'backend')

Write-Host '==> grading contract unit tests'
npm run test:grading-contract
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> grading regression (service + notify)'
npm run regression:grading
exit $LASTEXITCODE
