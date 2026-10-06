param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$protected = Get-Content -LiteralPath $ConfigPath -Raw | ConvertTo-SecureString
$credential = [pscredential]::new('config', $protected)
$config = $credential.GetNetworkCredential().Password | ConvertFrom-Json
$env:BACKUP_DATABASE_URL = $config.DatabaseUrl
$env:BACKUP_KEY = $config.Key
try {
    & $config.Python $config.BackupScript --directory $config.Directory
    if ($LASTEXITCODE -ne 0) { throw 'El respaldo no se completó.' }
} finally {
    Remove-Item Env:BACKUP_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_KEY -ErrorAction SilentlyContinue
}
