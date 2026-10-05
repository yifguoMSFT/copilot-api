# Tracked-file cleanup review

Reviewed: 2026-09-23. Branch: `main`. HEAD: `7471bea`.

The strongest cleanup candidates are the empty `.kanbansession`, the redundant `package-lock.json`, and the root `codex-models.json` snapshot. Historical Kanban files are candidates for archiving, with their evidence preserved. Several optional developer files need a usage decision before removal.

This report reviews the **106 paths returned by `git ls-files`**. Two tracked paths are already absent from the working tree and have identical untracked replacements. Recommendations distinguish deletion, removal from version control, and relocation; being unnecessary to the server does not by itself make documentation or developer tooling disposable. No existing files were removed or moved by this review.

## 1. Primary cleanup candidates

| Tracked file | Assessment and evidence | Recommended action | Condition before removal |
| --- | --- | --- | --- |
| `.kanbansession` | Contains only `{ "sessions": {} }`. It is empty local orchestration state, with no server/build/CI role. | Remove from version control and ignore future local session state, including `.kanbansession.log`. | No useful session data exists in the tracked file. |
| `package-lock.json` | A second dependency lockfile, about 491 KiB. Its root package version is `0.7.0`, while `package.json` is `0.7.1`. CI installs with Bun; Docker explicitly copies `bun.lock` and installs with `--frozen-lockfile`. No checked-in workflow uses `npm ci`. | Remove if Bun is the supported source-development package manager; retain `bun.lock`. | Confirm npm-based source development is not an intended supported workflow. Installing the published package with npm does not require this repository lockfile. If npm development is supported, synchronize and validate this lockfile instead. |
| `codex-models.json` | About 291 KiB of model metadata/instructions for nine entries. The current default catalog output is under `PATHS.APP_DIR`; the example writes `generated/codex-models.json`. No source, test, or checked-in startup configuration was found that loads this particular root snapshot. Tests create catalogs in temporary directories. | Remove the root snapshot from version control if it is generated/local data, or move it to an explicitly documented fixture/example if it is intentionally curated. | An external client can reference this file directly through an absolute catalog path. Check that usage and preserve any unique custom entries before removal. The refresh code alone does not prove this exact snapshot can be regenerated. |

Evidence: [package scripts](../package.json), [CI](../.github/workflows/ci.yml), [Dockerfile](../Dockerfile), [runtime configuration](../src/lib/runtime-config.ts), [catalog refresh](../src/lib/codex-models.ts), and [example configuration](../config.example.json).

## 2. Historical Kanban artifacts: archive candidates

These 13 files are orchestration records, generated task views, or historical experiment notes. They have no identified role in application startup, build, or CI. Archive each related group together under `kanban-archive/` after deciding whether its run will be resumed. Some files contain unique probe/validation evidence, so deletion of the entire group is less appropriate than relocation.

| Tracked file | Why it is a candidate / evidence to retain |
| --- | --- |
| `native-responses-proxy.kanban.json` | Blueprint for the native Responses work now represented in source, tests, README, and the implementation plan. Retain if the board remains resumable. |
| `native-responses-proxy.kanban.execution.json` | Execution history records four done runs and one running run. Do not label this board completed merely because the feature exists. |
| `native-responses-proxy.kanban.context.md` | Historical contract probes and validation results; archive or consolidate the unique findings before deletion. |
| `native-responses-proxy.kanban.task.md` | Generated task view still says `run_status: running` for documentation/regression testing. It is not a reliable statement of current project status. |
| `responses-stream-compatibility-experiment.kanban.json` | Blueprint for the earlier compatibility investigation. Archive with its execution history if no continuation is intended. |
| `responses-stream-compatibility-experiment.kanban.execution.json` | Execution history contains four done runs and one blocked run. This is historical unresolved workflow state, not a fully completed board. |
| `responses-stream-compatibility-experiment.kanban.context.md` | Describes the earlier diagnostic observer and default-off normalization experiment. The observer is absent from current source, and normalization is now default-on. Keep as historical evidence rather than current guidance. |
| `responses-stream-compatibility-experiment.kanban.task.md` | Generated view says running and instructs keeping raw passthrough as default, which is superseded by current behavior. |
| `responses-stream-item-id-experiment.kanban.json` | Blueprint for the narrower item-ID experiment; preserve with its run records if keeping the experiment history. |
| `responses-stream-item-id-experiment.kanban.execution.json` | All three recorded runs are done. Archive rather than retain as active root-level work state. |
| `responses-stream-item-id-experiment.kanban.context.md` | Wire/CLI results and the later user-confirmed Desktop observation; preserve any evidence not already captured in the canonical report. |
| `responses-stream-item-id-experiment.kanban.task.md` | Generated task view still says running, despite all recorded execution runs being done. |
| `responses-stream-item-id-experiment.kanban.review.md` | Records the causal decision and narrow Desktop evidence, but recommends a default-off experiment that has since been superseded. Preserve the decision as history. |

Blueprint `todo` fields alone were not used to infer current progress; execution files were inspected separately. Moving a board can require updating `blueprint_path`, generated task/context references, and wiki links. If resumability matters, verify those references before relocation.

The current [item-ID troubleshooting note](troubleshoot/copilot-responses-item-ids.md) and [experiment report](../RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md) should retain the evidence needed to explain why normalization remains enabled.

## 3. Already-relocated tracked paths

These are cleanup of old locations, not recommendations to discard their content. `git hash-object` of each replacement matches the tracked index blob of its original.

| Original tracked path, currently deleted | Existing untracked replacement | Action |
| --- | --- | --- |
| `DEEPSEEK_ROUTING_AND_ENV_CONFIG_DESIGN.md` | `docs/DEEPSEEK_ROUTING_AND_ENV_CONFIG_DESIGN.md` | Keep the design under `docs/`; include the replacement and old-path removal together when committing the relocation. |
| `deepseek-routing-env-config-implementation.kanban.json` | `kanban-archive/deepseek-routing-env-config-implementation.kanban.json` | Keep the archive copy if retaining planning history; include both sides of the relocation together. |

Committing only the deletions would lose these documents from the next checkout because their replacements are not yet tracked.

## 4. Optional developer files: usage-dependent

| Tracked file | Assessment | Recommendation |
| --- | --- | --- |
| `opencode.json` | Enables a Docker-based Playwright MCP server for OpenCode. It is tooling configuration, with no application/build/test reference found. Its presence does not establish whether a developer still uses it. | Remove from tracking or move to a documented example if it is personal setup. Keep if it is intentional shared project tooling. |
| `start.bat` | Windows convenience launcher referenced by README. It opens the hosted usage viewer and runs `bun run dev`; the current CLI defines an explicit `start` subcommand. Static inspection suggests the launcher needs correction, but it was not executed. | Prefer fixing the launch command if the Windows shortcut remains supported. Remove only if retiring the shortcut, and update README's reference at the same time. |

Neither file is an unconditional deletion candidate.

## 5. Root documentation worth relocating, not deleting

| Tracked file | Reason to retain | Optional organization change |
| --- | --- | --- |
| `RESPONSES_API_IMPLEMENTATION_PLAN.md` | Explains the native Responses transport decision and compatibility boundaries. | Move to a design/history directory after fixing references. |
| `RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_PLAN.md` | Defines the historical experiment and its success criteria; its draft/default-off framing should not be read as current runtime guidance. | Archive under `docs/` and label it historical. |
| `RESPONSES_STREAM_COMPATIBILITY_EXPERIMENT_REPORT.md` | Contains primary evidence supporting the item-ID workaround and is linked by current troubleshooting documentation. | Keep as the canonical report; optionally relocate under `docs/` with all links updated. |

These files make the repository root busier, but they are not redundant solely because their implementation or experiment has finished.

## 6. Files not identified as unnecessary

- `src/`, `tests/`, `package.json`, `bun.lock`, TypeScript/build/lint configuration, Docker files, and CI/release workflows have identifiable implementation or delivery roles. This inventory review does not establish that every internal symbol is used; no source deletion is recommended.
- `pages/index.html` is deployed by `.github/workflows/deploy-pages.yml` and is referenced by the usage-viewer flow.
- `.vscode/settings.json` configures project TypeScript and ESLint behavior; it is shared editor configuration, not empty state.
- `.github/FUNDING.yml` contains a configured Ko-fi target, so it is not an unused template despite its empty optional fields.
- `README.md`, `LICENSE`, `AGENTS.md`, `context.md`, `config.example.json`, `.gitignore`, `.dockerignore`, and the troubleshooting note remain useful project files.
- Untracked files such as the SQLite metrics proposal, Luna report, and `.kanbansession.log` were not counted among the 106 tracked paths. The two untracked relocation targets were inspected only to establish preservation of their tracked originals.

## Suggested cleanup order and validation

1. Remove empty session state from tracking and add narrow ignore rules for local session artifacts.
2. Decide package-manager support and external catalog usage before removing the npm lockfile or root catalog snapshot.
3. Complete the two existing relocations with their replacement files included.
4. Archive retired Kanban groups, preserving unique evidence and updating path references. Resolve whether running/blocked records need to remain resumable.
5. Decide whether OpenCode setup and the Windows launcher are supported shared tooling; document, fix, or retire them accordingly.

This review used the tracked-file inventory, file contents and sizes, repository reference searches, package/CI/Docker configuration, Kanban execution states, and blob comparisons. It did not run application tests, build, package installation, live requests, or developer launchers. Any later cleanup should check links and references; lockfile/catalog or launcher changes should also receive the relevant install/startup checks. This report itself authorizes no deletion.
