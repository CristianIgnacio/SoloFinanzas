# Respaldo manual bajo demanda.
# Uso: .\scripts\run-backup.ps1 [-ConfigPath C:\ruta\config.dpapi]
param([string]$ConfigPath = "$env:USERPROFILE\SoloFinanzasBackups\config.dpapi")
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "No se encontró la configuración en '$ConfigPath'. Ejecuta primero install-backup-task.ps1."
}
$protected = (Get-Content -LiteralPath $ConfigPath -Raw).Trim() | ConvertTo-SecureString
$credential = [pscredential]::new('config', $protected)
$config = $credential.GetNetworkCredential().Password | ConvertFrom-Json
$pgBin = $config.PgBin
if (-not $pgBin) {
    $installRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
    if (Test-Path -LiteralPath $installRoot) {
        $pgBin = Get-ChildItem -LiteralPath $installRoot -Directory |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\pg_dump.exe') } |
            Sort-Object Name -Descending |
            Select-Object -First 1 -ExpandProperty FullName
        if ($pgBin) { $pgBin = Join-Path $pgBin 'bin' }
    }
}
if ($pgBin) { $env:PATH = "$pgBin;$env:PATH" }
$env:BACKUP_DATABASE_URL = $config.DatabaseUrl
$env:BACKUP_KEY = $config.Key
try {
    & $config.Python $config.BackupScript --directory $config.Directory
    if ($LASTEXITCODE -ne 0) { throw 'El respaldo no se completó.' }
} finally {
    Remove-Item Env:BACKUP_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_KEY -ErrorAction SilentlyContinue
}
