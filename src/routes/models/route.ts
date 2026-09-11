import { Hono } from "hono"

import { forwardError } from "~/lib/error"
import { modelAliasEntries } from "~/lib/model-aliases"
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

        return [modelData, ...aliases]
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

    return c.json({
      object: "list",
      data: [...copilotModels, ...deepSeekModels],
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
