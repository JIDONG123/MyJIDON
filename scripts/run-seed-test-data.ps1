# 幂等写入测试数据（不 TRUNCATE、不改已有账号密码）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Seed test data"
Push-Location (Join-Path $root 'backend')
npm run seed:test
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }
Write-Host "==> Done"
