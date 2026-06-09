<#
.SYNOPSIS
  在本机 MySQL 8 上创建 boardgame 库并导入 db/init 下脚本。

.EXAMPLE
  .\db\setup-local.ps1 -MysqlExe "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -AdminUser root -AdminPassword "你的root密码"

  若 root 无密码：
  .\db\setup-local.ps1 -MysqlExe "...\mysql.exe" -AdminUser root -AdminPassword ""

  已建好库且只想用 boardgame 账号导入（需先执行过 create-app-user.sql）：
  .\db\setup-local.ps1 -MysqlExe "...\mysql.exe" -UseAppUser -AppPassword "boardgame"

  重装 / 想清空旧库后重建（会 DROP DATABASE）：
  .\db\setup-local.ps1 -AdminPassword "你的root密码" -ResetDatabase
#>
[CmdletBinding()]
param(
  [string]$MysqlExe = "",
  [string]$AdminUser = "root",
  [string]$AdminPassword = "",
  [switch]$UseAppUser,
  [string]$AppUser = "boardgame",
  [string]$AppPassword = "boardgame",
  [string]$Database = "boardgame",
  [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"

if ($UseAppUser -and $ResetDatabase) {
  Write-Host "-ResetDatabase 需用管理员账号执行，不能与 -UseAppUser 同时使用。" -ForegroundColor Red
  exit 1
}

function Get-SinglePathString {
  param($PathOrPathInfo)
  if ($null -eq $PathOrPathInfo) { return $null }
  if ($PathOrPathInfo -is [string]) {
    $s = $PathOrPathInfo.Trim()
    return $(if ($s -eq "") { $null } else { $s })
  }
  if ($PathOrPathInfo -is [System.Array]) {
    if ($PathOrPathInfo.Count -eq 0) { return $null }
    return Get-SinglePathString $PathOrPathInfo[0]
  }
  if ($PathOrPathInfo.PSObject.Properties.Match("Path").Count) {
    return [string]$PathOrPathInfo.Path
  }
  return [string]$PathOrPathInfo
}

function Resolve-MysqlExePath {
  if ($MysqlExe -and (Test-Path -LiteralPath $MysqlExe)) {
    return Get-SinglePathString (Resolve-Path -LiteralPath $MysqlExe)
  }
  foreach ($ver in @("8.4", "8.3", "8.2", "8.1", "8.0")) {
    $p = Join-Path $env:ProgramFiles "MySQL\MySQL Server $ver\bin\mysql.exe"
    if (Test-Path -LiteralPath $p) { return $p }
  }
  $roots = @(
    "${env:ProgramFiles}\MySQL",
    "${env:ProgramFiles(x86)}\MySQL"
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    $found = @(Get-ChildItem -Path $root -Recurse -Filter "mysql.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\bin\\mysql\.exe$" } |
        Select-Object -First 1)
    if ($found.Count -ge 1) { return [string]$found[0].FullName }
  }
  return $null
}

$script:MySqlBin = Resolve-MysqlExePath
if ([string]::IsNullOrWhiteSpace($script:MySqlBin) -or -not (Test-Path -LiteralPath $script:MySqlBin)) {
  Write-Host "未找到 mysql.exe。请安装 MySQL 8 或使用 -MysqlExe 指定完整路径。" -ForegroundColor Red
  exit 1
}
Write-Host "使用: $script:MySqlBin" -ForegroundColor Cyan

function To-SourcePath([string]$p) {
  return ($p -replace "\\", "/")
}

function Invoke-MysqlCli {
  param(
    [string]$User,
    [string]$Pass,
    [AllowNull()][AllowEmptyString()][string]$DbName,
    [Parameter(Mandatory)][string[]]$TailArgs
  )
  $bin = [string]$script:MySqlBin
  if ($Pass) { $env:MYSQL_PWD = $Pass }
  try {
    $argsList = [System.Collections.ArrayList]::new()
    [void]$argsList.Add("-u$User")
    if (-not [string]::IsNullOrWhiteSpace($DbName)) {
      [void]$argsList.Add($DbName)
    }
    [void]$argsList.Add("--default-character-set=utf8mb4")
    foreach ($t in $TailArgs) { [void]$argsList.Add($t) }
    $arr = [string[]]@($argsList.ToArray())
    & $bin @arr
    if ($LASTEXITCODE -ne 0) {
      throw "mysql 退出码 $LASTEXITCODE。请检查账号密码、SQL 或权限。"
    }
  }
  finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  }
}

function Invoke-MysqlExec {
  param([string]$User, [string]$Pass, [AllowNull()][string]$DbName, [string]$Sql)
  Invoke-MysqlCli -User $User -Pass $Pass -DbName $DbName -TailArgs @("-e", $Sql)
}

function Invoke-MysqlSource {
  param([string]$User, [string]$Pass, [string]$FilePath, [AllowNull()][string]$DbName)
  $src = To-SourcePath $FilePath
  Invoke-MysqlCli -User $User -Pass $Pass -DbName $DbName -TailArgs @("-e", "source $src")
}

$bootstrap = Join-Path $PSScriptRoot "bootstrap.sql"
$userSql = Join-Path $PSScriptRoot "create-app-user.sql"
$initDir = Join-Path $PSScriptRoot "init"
$ordered = @("01_schema.sql", "02_procedures.sql", "03_seed.sql", "04_views.sql")

if (-not $UseAppUser) {
  if ($ResetDatabase) {
    Write-Host "已指定 -ResetDatabase：删除已有库 $Database（若存在）..." -ForegroundColor Yellow
    $dropSql = "DROP DATABASE IF EXISTS ``$Database``;"
    Invoke-MysqlExec -User $AdminUser -Pass $AdminPassword -DbName $null -Sql $dropSql
  }

  Write-Host "步骤 1/2: 创建数据库 (管理员 $AdminUser)..." -ForegroundColor Cyan
  Invoke-MysqlSource -User $AdminUser -Pass $AdminPassword -FilePath $bootstrap -DbName $null

  Write-Host "步骤 2/2: 创建应用账号 ${AppUser}@localhost ..." -ForegroundColor Cyan
  Invoke-MysqlSource -User $AdminUser -Pass $AdminPassword -FilePath $userSql -DbName $null
}
else {
  Write-Host "跳过建库/建用户 (-UseAppUser)，仅导入到 $Database ..." -ForegroundColor Yellow
}

$impUser = $AppUser
$impPass = $AppPassword

Write-Host "导入表、过程、触发器、种子、视图 ..." -ForegroundColor Cyan
foreach ($name in $ordered) {
  $f = Join-Path $initDir $name
  if (-not (Test-Path $f)) { throw "缺少文件: $f" }
  Write-Host "  -> $name" -ForegroundColor DarkGray
  Invoke-MysqlSource -User $impUser -Pass $impPass -FilePath $f -DbName $Database
}

Write-Host "完成。请在 server/.env 中配置 DB 后运行: npm run dev" -ForegroundColor Green
