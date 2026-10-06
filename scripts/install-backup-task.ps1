# Ejecutar una vez, después de configurar PostgreSQL y guardar una copia de la clave.
param([string]$Directory = "$env:USERPROFILE\SoloFinanzasBackups")
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo 'backend\.venv\Scripts\python.exe'
Get-Command pg_dump -ErrorAction Stop | Out-Null
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
$config = @{ DatabaseUrl=$url; Key=$key; Python=$python; Directory=$taskDirectory; BackupScript=(Join-Path $repo 'backend\scripts\backup.py') }
$json = $config | ConvertTo-Json -Compress
$json | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $configPath
Write-Host 'Guarda esta clave en tu gestor de contraseñas: es necesaria si pierdes este equipo.'
Write-Host $key
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$PSScriptRoot\run-backup.ps1`" -ConfigPath `"$configPath`""
$triggers = @((New-ScheduledTaskTrigger -Daily -At '09:00'), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName 'SoloFinanzasBackup' -Action $action -Trigger $triggers -Settings $settings -Description 'Respaldo diario cifrado; recupera ejecuciones pendientes al iniciar sesión.' | Out-Null
Start-ScheduledTask -TaskName 'SoloFinanzasBackup'
