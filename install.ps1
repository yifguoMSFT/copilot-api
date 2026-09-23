$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Bun {
    & $script:bunCommand @args
    if ($LASTEXITCODE -ne 0) { throw "bun $args failed (exit $LASTEXITCODE)." }
}

Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            throw 'Install Node.js LTS from https://nodejs.org, then run install.ps1 again.'
        }
        Write-Host 'Installing Node.js LTS...'
        winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw 'Node.js installation failed.' }
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Open a new terminal and run install.ps1 again to load Node.js.' }
    }

    $bunRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $env:USERPROFILE '.bun' }
    $bunBin = Join-Path $bunRoot 'bin'
    $env:Path = "$bunBin;$env:Path"
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Host 'Installing Bun...'
        $bootstrap = Join-Path ([IO.Path]::GetTempPath()) ('bun-install-' + [Guid]::NewGuid().ToString('N') + '.ps1')
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest 'https://bun.sh/install.ps1' -UseBasicParsing -OutFile $bootstrap
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrap
            if ($LASTEXITCODE -ne 0) { throw 'Bun installation failed.' }
        } finally {
            if (Test-Path -LiteralPath $bootstrap) { Remove-Item -LiteralPath $bootstrap }
        }
    }
    $bunLauncher = (Get-Command bun -ErrorAction Stop).Source
    $script:bunCommand = & $bunLauncher --print 'process.execPath'
    if ($LASTEXITCODE -ne 0) { throw 'Could not locate the Bun executable.' }
    $bunRuntimeBin = Split-Path -Parent $script:bunCommand
    $env:Path = "$bunRuntimeBin;$env:Path"

    Write-Host 'Installing project dependencies...'
    Invoke-Bun install --frozen-lockfile --ignore-scripts
    Write-Host 'Building copilot-api...'
    Invoke-Bun run build --no-clean
    Write-Host 'Registering the global copilot-api command...'
    Invoke-Bun link

    $cli = Join-Path $bunBin 'copilot-api.exe'
    if (-not (Test-Path -LiteralPath $cli)) { throw "bun link did not create $cli. Check your Bun global bin configuration." }
    & $cli --help
    if ($LASTEXITCODE -ne 0) { throw 'The installed copilot-api command failed.' }

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    foreach ($commandBin in @($bunBin, $bunRuntimeBin)) {
        if (@($userPath -split ';' | ForEach-Object { $_.TrimEnd('\', '/') }) -notcontains $commandBin.TrimEnd('\', '/')) {
            $userPath = "$commandBin;$userPath"
        }
    }
    [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')

    Write-Host 'Generating the catalog and configuring Codex...'
    Invoke-Bun run scripts/setup-codex.ts
    Write-Host 'Authenticating with GitHub. Follow the device login instructions...'
    & $cli auth
    if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication failed.' }
    Write-Host ''
    Write-Host 'Installed. Open a new terminal and run: copilot-api start'
    Write-Host 'Restart Codex after the proxy starts.'
    Write-Host "Keep this folder in place: $PSScriptRoot"
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    Pop-Location
}
