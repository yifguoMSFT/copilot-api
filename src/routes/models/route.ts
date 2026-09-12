import { Hono } from "hono"

import { codexModelCapabilities } from "~/lib/codex-models"
import { forwardError } from "~/lib/error"
import { modelAliasEntries } from "~/lib/model-aliases"
import { addModelSeparators } from "~/lib/model-separators"
import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"

export const modelRoutes = new Hono()

modelRoutes.get("/", async (c) => {
  try {
    if (
      !state.models
      && state.runtimeConfig?.providers.copilot.enabled !== false
    ) {
      // This should be handled by startup logic, but as a fallback.
      await cacheModels()
    }

    const suffixedBaseIds = new Set(
      [...(state.publishedModels?.entries.values() ?? [])].map(
        (entry) => entry.baseModel,
      ),
    )

    const copilotModels =
      state.models?.data.flatMap((model) => {
        const modelData = {
          id: model.id,
          object: "model",
          type: "model",
          created: 0, // No date available from source
          created_at: new Date(0).toISOString(), // No date available from source
          owned_by: model.vendor,
          display_name: model.name,
        }
        const aliases = modelAliasEntries
          .filter(([, target]) => target === model.id)
          .map(([alias]) => ({
            ...modelData,
            id: alias,
            display_name: alias,
          }))

        // A model both providers serve is reachable only through its source
        // suffixed ids, so the bare entry is not republished here.
        return suffixedBaseIds.has(model.id) ? aliases : [modelData, ...aliases]
      }) ?? []
    const deepSeekModels =
      state.runtimeConfig?.providers.deepseek.enabled === true ?
        state.runtimeConfig.providers.deepseek.models.map((id) => ({
          id,
          object: "model",
          type: "model",
          created: 0,
          created_at: new Date(0).toISOString(),
          owned_by: "deepseek",
          display_name: id,
        }))
      : []
    // Source-suffixed ids are the only public ids for a model that both
    // providers can serve; while suffixes are off this list stays empty and the
    // bare Copilot entries above are the published set.
    const sourceModels = [
      ...(state.publishedModels?.entries.values() ?? []),
    ].map((entry) => ({
      ...codexModelCapabilities(entry.capabilities),
      id: entry.publicModel,
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: entry.provider,
      display_name: entry.displayName ?? entry.publicModel,
    }))

    return c.json({
      object: "list",
      data: addModelSeparators(
        [
          ...sourceModels.filter((model) => model.owned_by === "codex"),
          ...deepSeekModels,
          ...sourceModels.filter((model) => model.owned_by === "copilot"),
          ...copilotModels,
        ],
        (model) => {
          if (model.id.endsWith("(codex)")) return "codex"
          return model.owned_by === "deepseek" ? "deepseek" : "copilot"
        },
        (model, id) => ({ ...model, id, display_name: id }),
      ),
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
