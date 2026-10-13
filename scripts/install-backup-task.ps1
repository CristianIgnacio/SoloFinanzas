# Ejecutar una vez, después de configurar PostgreSQL y guardar una copia de la clave.
# Uso: .\install-backup-task.ps1 [-Directory C:\MisBackups]
param([string]$Directory = "$env:USERPROFILE\SoloFinanzasBackups")
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo 'backend\.venv\Scripts\python.exe'
$pgDump = Get-Command pg_dump -ErrorAction Stop
Get-Command pg_restore -ErrorAction Stop | Out-Null
Get-Command psql -ErrorAction Stop | Out-Null
if (-not (Test-Path -LiteralPath $python)) { throw 'Crea primero backend/.venv.' }
$taskDirectory = [IO.Path]::GetFullPath($Directory)
$repoAbsolute = [IO.Path]::GetFullPath($repo).TrimEnd('\')
if ($taskDirectory.StartsWith($repoAbsolute + '\', [StringComparison]::OrdinalIgnoreCase) -or $taskDirectory -eq $repoAbsolute) {
    throw 'Elige un directorio fuera del repositorio.'
}
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$configPath = Join-Path $taskDirectory 'config.dpapi'
if (Test-Path -LiteralPath $configPath) { throw 'Ya existe configuración. No se reemplazará su clave.' }
$urlSecret = Read-Host 'URL PostgreSQL de respaldo (entrada oculta)' -AsSecureString
$url = ([pscredential]::new('url', $urlSecret)).GetNetworkCredential().Password
$key = & $python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
$config = @{ DatabaseUrl=$url; Key=$key; Python=$python; Directory=$taskDirectory; BackupScript=(Join-Path $repo 'backend\scripts\backup.py'); PgBin=(Split-Path -Parent $pgDump.Source) }
$json = $config | ConvertTo-Json -Compress
$json | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $configPath
Write-Host ''
Write-Host 'Configuración guardada. Guarda esta clave en tu gestor de contraseñas:'
Write-Host $key
Write-Host ''
Write-Host "Para respaldar, ejecuta:"
Write-Host "  .\scripts\run-backup.ps1"
