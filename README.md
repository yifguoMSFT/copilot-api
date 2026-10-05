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

For queryable request capture, start with `copilot-api start --dump-requests`. This appends complete incoming and upstream API request bodies and credential-redacted headers to `logs/requests.sqlite` in the working directory. See [request dump queries and capture scope](docs/troubleshoot/request-dumps.md). This flag works independently of `--verbose`.

## Compaction model routing

Compaction routing is disabled by default. To send Codex compaction requests to a specific model, save this as `config.json`:

```json
{
  "version": 1,
  "defaults": {
    "compaction": {
      "enabled": false,
      "model": "gpt-6-luna"
    }
  },
  "environments": {
    "luna-compaction": {
      "compaction": { "enabled": true }
    }
  }
}
```

After rebuilding, start with the named environment:

```powershell
bun run build
copilot-api start --env luna-compaction
```

The proxy automatically loads `config.json` from the package folder (`dist\..` for the installed CLI), alongside the default `codex-models.json`, regardless of the terminal's working directory. Save the configuration in that folder. Symlinked commands resolve to the actual package folder. `--config` takes precedence over `COPILOT_API_CONFIG`, which takes precedence over automatic discovery; explicit relative paths resolve from the working directory. A missing default file uses built-in settings; an explicitly selected missing file or an invalid/unreadable file fails startup. Configuration changes require restarting the proxy. Starting without the named environment keeps the example disabled. `compaction.model` must be a nonblank model identifier when enabled; named environments inherit unspecified fields from defaults.

Only POST `/responses` and `/v1/responses` requests explicitly marked `request_kind: "compaction"` in JSON-valued `x-codex-turn-metadata` are overridden. Body `client_metadata["x-codex-turn-metadata"]` is used only when the header is absent. Prompt text does not trigger routing. Ordinary turns keep their requested model; compaction changes only the top-level request model through existing alias/provider routing. Upstream model errors are surfaced without fallback. Dedicated `/responses/compact` and WebSocket requests are outside this feature. Cross-model compaction and subsequent continuation must be verified for the chosen models and history; routing does not remove encrypted state or change reasoning settings.

## Exclude models from the Codex catalog

Set `defaults.catalog.disabledModels` in `config.json` to omit exact model slugs from `codex-models.json`:

```json
{
  "version": 1,
  "defaults": {
    "catalog": {
      "disabledModels": ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]
    }
  }
}
```

Merge this setting with your other configuration. After rebuilding and restarting the proxy with this config and catalog generation enabled, restart Codex to load the filtered catalog. The installer applies the same exclusions. Filtering applies after upstream, cached, DeepSeek, and custom models are merged. An environment's list replaces the default list; `[]` clears it. Matching is exact and case-sensitive, so newly introduced GPT-5 slugs need to be added explicitly. Exclusions affect catalog visibility; explicit API requests and routing aliases can still use those models.

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
