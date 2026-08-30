<#
.SYNOPSIS
  Applies the multi-account/streaks schema, rotates the leaked Postgres password
  and storage key, and sets the new app settings on api-sthir.

.DESCRIPTION
  Run this once, from the notes-app folder, after signing in to the tenant that
  owns rg-sthir:

      az login --tenant 525ee081-733e-4236-bdb8-5cf3869cd629 --use-device-code
      powershell -ExecutionPolicy Bypass -File .\scripts\rotate-and-migrate.ps1

  Order matters and is deliberate: the migration runs with the CURRENT
  credentials (read straight out of App Service, so nothing has to be typed or
  pasted), and only then are the secrets rotated and the settings rewritten.
  Rotating first would leave the migration unable to connect.

  Safe to re-run. The SQL is idempotent, and a second run simply rotates to
  another new password/key.

  NOTE: this file is deliberately pure ASCII. Windows PowerShell 5.1 reads .ps1
  as ANSI unless there is a BOM, so non-ASCII characters break the parse.

.NOTES
  Rotating the storage key invalidates SAS URLs already handed out, so
  attachments open in a browser tab will 403 until the page is refreshed.
#>

[CmdletBinding()]
param(
    [string]$ResourceGroup   = 'rg-sthir',
    [string]$ApiApp          = 'api-sthir',
    [string]$PgServer        = 'psql-sthir',
    [string]$PgAdmin         = 'dbadmin',
    [string]$PgDatabase      = 'sthir',
    [string]$StorageAccount  = 'sthirblob',
    [string]$AppUrl          = 'https://nice-bay-00d6eb300.7.azurestaticapps.net',
    [switch]$SkipRotation
)

$ErrorActionPreference = 'Stop'
$azExe = 'az.cmd'   # bare "az" resolves to az.ps1, which execution policy blocks

function Step([string]$m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Note([string]$m) { Write-Host "    $m" -ForegroundColor DarkGray }

# PowerShell does not raise a terminating error when a native command exits
# non-zero, so every az call has to be checked explicitly or failures sail past.
# Args are passed as one explicit array: with ValueFromRemainingArguments,
# PowerShell would try to bind az switches such as -o to this function and fail
# with "the parameter name 'o' is ambiguous".
function Invoke-Az {
    param([Parameter(Mandatory = $true)][string[]]$AzArgs)
    $output = & $azExe @AzArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("az " + ($AzArgs -join ' ') + " failed ($LASTEXITCODE):`n" + ($output -join "`n"))
    }
    return $output
}

function New-RandomToken([int]$Length) {
    $alphabet = [char[]]((48..57) + (65..90) + (97..122) | ForEach-Object { [char]$_ })
    -join (1..$Length | ForEach-Object { $alphabet | Get-Random })
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir   = Join-Path $repoRoot 'apps\api'
$sqlFile  = Join-Path $apiDir 'prisma\sql\2026-08-30_multi_account_and_streaks.sql'
if (-not (Test-Path $sqlFile)) { throw "Migration file not found: $sqlFile" }

# --- 0. Confirm we are pointed at the right subscription --------------------
Step 'Checking Azure context'
$acct = (Invoke-Az -AzArgs @('account','show','-o','json')) | ConvertFrom-Json
Note "Subscription: $($acct.name)"
Note "Tenant:       $($acct.tenantId)"
Invoke-Az -AzArgs @('group','show','-n',$ResourceGroup,'-o','none') | Out-Null
Note "Resource group '$ResourceGroup' is reachable."

# --- 1. Temporarily allow this machine through the Postgres firewall --------
Step 'Opening the Postgres firewall for this machine'
$myIp = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
$ruleName = 'tmp-migrate-' + (Get-Date -Format 'yyyyMMddHHmmss')
Note "Public IP: $myIp  (rule: $ruleName)"

# Flexible Server only. An earlier version probed and fell back to Single Server
# on any failure, which turned a simple wrong-argument error into a bogus
# "this must be a Single Server" conclusion. Fail loudly instead.
Invoke-Az -AzArgs @('postgres','flexible-server','firewall-rule','create','-g',$ResourceGroup,'-s',$PgServer,
    '-n',$ruleName,'--start-ip-address',$myIp,'--end-ip-address',$myIp,'-o','none') | Out-Null
Note 'Firewall rule created.'

try {
    # --- 2. Apply the schema using the CURRENT connection string ------------
    Step 'Applying the schema migration'
    $currentDbUrl = Invoke-Az -AzArgs @('webapp','config','appsettings','list','-g',$ResourceGroup,'-n',$ApiApp,
        '--query',"[?name=='DATABASE_URL'].value | [0]",'-o','tsv')
    if ([string]::IsNullOrWhiteSpace($currentDbUrl)) {
        throw "DATABASE_URL is not set on $ApiApp, so the database cannot be reached."
    }

    Push-Location $apiDir
    try {
        & npx.cmd prisma db execute --url $currentDbUrl --file $sqlFile
        if ($LASTEXITCODE -ne 0) { throw "prisma db execute failed ($LASTEXITCODE)." }
    } finally { Pop-Location }
    Note 'Schema applied: users.display_name/updated_at, sessions, password_reset_tokens, writing_days.'

    if ($SkipRotation) {
        Step 'Skipping rotation (-SkipRotation)'
        $newDbUrl      = $currentDbUrl
        $newStorageKey = $null
    }
    else {
        # --- 3. Rotate the Postgres admin password -------------------------
        Step 'Rotating the Postgres admin password'
        # Alphanumeric only: keeps the URL-encoding of DATABASE_URL trivial and
        # avoids Postgres/CLI quoting surprises.
        $newPgPassword = New-RandomToken 32

        Invoke-Az -AzArgs @('postgres','flexible-server','update','-g',$ResourceGroup,'-n',$PgServer,
            '--admin-password',$newPgPassword,'-o','none') | Out-Null

        $newDbUrl = 'postgresql://' + $PgAdmin + ':' + $newPgPassword + '@' +
                    $PgServer + '.postgres.database.azure.com:5432/' +
                    $PgDatabase + '?sslmode=require'
        Note 'Postgres password rotated.'

        # --- 4. Rotate the storage account key -----------------------------
        Step 'Rotating the storage account key (key1)'
        Invoke-Az -AzArgs @('storage','account','keys','renew','-g',$ResourceGroup,'-n',$StorageAccount,'--key','key1','-o','none') | Out-Null
        $newStorageKey = Invoke-Az -AzArgs @('storage','account','keys','list','-g',$ResourceGroup,'-n',$StorageAccount,
            '--query',"[?keyName=='key1'].value | [0]",'-o','tsv')
        if ([string]::IsNullOrWhiteSpace($newStorageKey)) { throw 'Could not read the new storage key.' }
        Note 'Storage key1 rotated.'
    }

    # --- 5. Write the new application settings ------------------------------
    Step "Updating app settings on $ApiApp"
    $inviteCode = New-RandomToken 28

    $settings = @(
        "DATABASE_URL=$newDbUrl",
        "APP_URL=$AppUrl",
        'SIGNUP_MODE=invite',
        "SIGNUP_INVITE_CODE=$inviteCode",
        'MAIL_PROVIDER=console'
    )
    if ($newStorageKey) { $settings += "AZURE_STORAGE_KEY=$newStorageKey" }

    Invoke-Az -AzArgs (@('webapp','config','appsettings','set','-g',$ResourceGroup,'-n',$ApiApp,'--settings') + $settings + @('-o','none')) | Out-Null
    Note 'Settings written.'

    # --- 6. Restart and verify ---------------------------------------------
    Step 'Restarting the API'
    Invoke-Az -AzArgs @('webapp','restart','-g',$ResourceGroup,'-n',$ApiApp,'-o','none') | Out-Null

    $health = "https://$ApiApp.azurewebsites.net/api/health"
    Note "Waiting for $health ..."
    $ok = $false
    foreach ($attempt in 1..30) {
        Start-Sleep -Seconds 5
        try {
            if ((Invoke-RestMethod -Uri $health -TimeoutSec 10).ok) { $ok = $true; break }
        } catch { }
    }
    if (-not $ok) { throw "API did not become healthy. Check: az webapp log tail -g $ResourceGroup -n $ApiApp" }
    Note 'API is healthy.'

    Write-Host "`n================ DONE ================" -ForegroundColor Green
    Write-Host "Invite code (needed to register, store it somewhere safe):" -ForegroundColor Yellow
    Write-Host "    $inviteCode" -ForegroundColor Yellow
    Write-Host "`nThe new DB password and storage key were written straight into App"
    Write-Host "Service settings and were never printed. Read them back with:"
    Write-Host "    az webapp config appsettings list -g $ResourceGroup -n $ApiApp -o table"
    Write-Host "`nStill to do: deploy the API and frontend code (see deploy.md)."
}
finally {
    # --- 7. Always close the firewall back up -------------------------------
    Step 'Removing the temporary firewall rule'
    try {
        Invoke-Az -AzArgs @('postgres','flexible-server','firewall-rule','delete','-g',$ResourceGroup,'-s',$PgServer,
            '-n',$ruleName,'--yes','-o','none') | Out-Null
        Note 'Removed.'
    } catch {
        Write-Warning "Could not remove firewall rule '$ruleName'; delete it manually."
    }
}
