---
status: implemented; manual validation pending
last_updated: 2026-10-05
---

# Configured model exclusions from the Codex catalog

## Problem and scope

Copilot API generates `codex-models.json` from the upstream Codex catalog, enabled DeepSeek entries, and custom catalog files. Operators cannot currently exclude individual models through `config.json`. Editing the generated file manually lasts only until the next refresh.

Add a persistent list of disabled model slugs to the catalog configuration. Every successful generation must omit those slugs, including when they appear in custom files or the upstream cache. An absent or empty list includes all merged models.

This feature controls the contents of `codex-models.json`. API request routing, `/v1/models`, review aliases, and compaction routing operate independently. Removing a model from this file does not block a client that explicitly requests it or replace a model already selected in Codex configuration.

## Configuration

```json
{
  "version": 1,
  "defaults": {
    "catalog": {
      "disabledModels": [
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5"
      ]
    }
  }
}
```

*Listing 1. Proposed configuration in `config.json`.*

The list lives under `defaults.catalog` and can also be supplied under an environment's `catalog` section, following the existing configuration layering.

| Setting or behavior | Current | Proposed |
| --- | --- | --- |
| `catalog.disabledModels` | Unsupported | Array of exact catalog slugs, default `[]` |
| Environment override | No exclusion setting | Replaces the complete default exclusion list |
| Environment value `[]` | Unsupported | Clears exclusions inherited from defaults |
| Matching | All merged entries are emitted | Entries whose `slug` matches an excluded string are omitted |

The name describes operator intent while keeping the setting scoped to catalog generation.

Validate entries as strings, trim surrounding whitespace, and reject empty strings. Matching is case-sensitive and exact; there are no wildcards, prefix rules, or alias expansion. Duplicate entries have no additional effect. An unknown slug is allowed so operators can exclude a model before it appears upstream. Report unmatched slugs in the generation summary to expose possible typos without blocking startup.

Configuration version stays `1` because the new field is optional. Older proxy versions reject it through their strict schema, so the proxy must be updated before this setting is added. No new CLI flag or environment variable is required.

## Generation behavior

Load the effective configuration, then pass `catalog.disabledModels` into the shared `refreshCodexModels` function. The function accepts an optional `disabledModels` option, treating omission as an empty list for existing callers.

Generation proceeds as follows:

1. Fetch and validate the upstream catalog, or load the upstream cache when the download fails.
2. Merge upstream, enabled DeepSeek, and custom entries using the existing slug deduplication and precedence.
3. Remove the configured slugs from the merged model map.
4. Write the resulting catalog through the existing temporary-file and rename sequence.

Filtering after merging gives exclusions precedence over every source. All retained entries keep their metadata and relative order. The upstream cache stores the complete upstream catalog so clearing an exclusion can restore a model during an offline refresh.

Both generation entry points use this option: proxy startup in `src/start.ts` and installation in `scripts/setup-codex.ts`. The legacy string-based catalog function call uses an empty exclusion list. Configuration loading and list replacement belong in `src/lib/runtime-config.ts`; final filtering belongs in `src/lib/codex-models.ts`.

The existing catalog refresh switch still governs startup generation. When `catalog.enabled` is false, startup does not regenerate the file or apply changed exclusions. The installer explicitly generates a catalog and applies its loaded exclusions.

Log the output path, retained model count, removed slugs, and configured slugs absent from the merged catalog. Logging model names is sufficient; request bodies and credentials are unnecessary.

## Failure behavior and limits

Invalid configuration fails validation before generation. A failed refresh retains the previously generated file and reports the failure, so the requested exclusions are not guaranteed to have taken effect until generation succeeds. Operators should inspect the generated file when a refresh reports an error.

An exclusion list that removes every merged entry produces an empty catalog during proxy startup, consistent with the current generator's support for empty catalogs. The installer already rejects an empty generated catalog before replacing the installed catalog or updating Codex configuration. Its error should explain that exclusions, unavailable catalog sources, or both may have left no models. Disabling every model is therefore not a supported installation setup.

Catalog omission is a model-discovery preference, not an enforcement boundary. Clients may retain a selected model, use an alias, or send an explicit model name. For example, omitting `gpt-5.6-luna` does not rewrite incoming requests for `gpt-5.6-luna`. Request rejection or remapping would require a separate routing feature.

## Alternatives

| Approach | Tradeoff |
| --- | --- |
| Edit the generated JSON | Simple initially, but the next refresh restores removed entries |
| Maintain an allowlist | Prevents new upstream models appearing automatically and requires ongoing maintenance |
| Add per-model enablement objects | Supports future settings, but adds structure without a current need |
| Reject disabled models in API handlers | Enforces request policy, but expands this feature beyond catalog selection |

An exclusion array fits the existing catalog settings and retains automatic discovery of new models.

## Validation and rollout

Validate configuration defaults, invalid entries, environment replacement, and clearing with `[]`. Catalog tests should establish that exclusions apply to upstream, cached, custom, and DeepSeek entries, including custom entries that replace an upstream slug. Verify exact matching, retained metadata and order, unmatched slugs, and an empty result.

Before release, verify that installation and startup produce equivalent filtered catalogs when given equivalent sources and configuration. Installation must retain its previous catalog and Codex configuration when filtering leaves no models. Existing catalog and routing tests must pass with no exclusion setting.

Document the new field in `config.example.json` and the README alongside the implementation. Operators apply it by editing the package folder's `config.json` and restarting the proxy with catalog generation enabled, then restarting Codex to reload the file. Default config lookup uses the same resolved package folder as the catalog (`dist/..` for installed execution), independently of the launch directory. Explicit `--config` and `COPILOT_API_CONFIG` overrides still select an alternate file.

Remove a slug from the list, regenerate, and restart Codex to restore it. No cache migration is required. The implementation is narrowly scoped to configuration loading, the shared generator, its two callers, and installation diagnostics. The feature is implemented and built; validation against the running proxy and Codex is pending.
