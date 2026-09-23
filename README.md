# Copilot API Proxy

A local, unofficial GitHub Copilot API proxy for Codex.

## Install on Windows

Use a full checkout of this repository, a GitHub account with Copilot access, and a separately installed Codex. Network access is required to download dependencies and the initial model catalog.

Run [install.ps1](install.ps1) from PowerShell in the repository folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

The installer:

- Installs missing Node.js LTS through Windows Package Manager (`winget`) and installs Bun if missing.
- Installs project dependencies and builds the CLI into `dist`.
- Links `copilot-api` globally to run with Bun and adds Bun's command folder to your user PATH, making the command available from any directory for your Windows account.
- Generates `codex-models.json` in the repository folder.
- Creates or updates Codex's configuration to use the proxy and that catalog.
- Runs `copilot-api auth` as the final setup step. Follow the displayed GitHub device login instructions to finish installation.

If Node.js is missing and `winget` is unavailable, install [Node.js LTS](https://nodejs.org/) and run the installer again.

Keep the repository folder in place: the global command links to this checkout.

## Start the proxy

Open a new terminal so it picks up the PATH change, then run:

```powershell
copilot-api start
```

The proxy reuses the GitHub credentials saved during installation. Keep the terminal running and restart Codex after the proxy starts. The default API address is `http://localhost:4141/v1`.

The installer does not start a background service. Run `copilot-api start` whenever you need the proxy; press `Ctrl+C` to stop it.

## Codex configuration

The installer uses `%USERPROFILE%\.codex\config.toml`, or `%CODEX_HOME%\config.toml` when `CODEX_HOME` is set. It creates both the folder and file if they do not exist.

It sets the following values, using the actual absolute path to your checkout for `model_catalog_json`:

```toml
model_provider = "copilot-api"
model_catalog_json = "E:/your/copilot-api/codex-models.json"

[model_providers.copilot-api]
name = "GitHub Copilot API"
base_url = "http://localhost:4141/v1"
wire_api = "responses"
requires_openai_auth = false
```

Existing model selection and unrelated settings are preserved. Before changing an existing config, the installer saves an exact timestamped backup beside it as `config.toml.*.bak`. TOML formatting is rewritten and comments are removed. Invalid existing TOML is left untouched and reported as an error.

By default, the proxy refreshes the model catalog from OpenAI's Codex catalog on startup and writes it to `codex-models.json` in the repository folder (`dist\..`), regardless of the directory you start it from. Restart Codex to load a refreshed catalog.

## Update

Stop the proxy, get the latest repository code, and run [install.ps1](install.ps1) again using the installation command above to update dependencies, rebuild the CLI, refresh the catalog, and update Codex's configuration. Repeated installs reuse the same provider entry and run GitHub authentication again as the final step.

Start the proxy again with `copilot-api start`, then restart Codex.
