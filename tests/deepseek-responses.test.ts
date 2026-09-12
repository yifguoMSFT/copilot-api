import { expect, spyOn, test } from "bun:test"

import { createDeepSeekResponses } from "../src/services/deepseek/create-responses"

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

test("uses only DeepSeek authentication and disables redirects", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok"),
  )
  try {
    await createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://api.deepseek.com/",
      apiKey: "test-key",
      models: ["deepseek-flash"],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/responses",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ authorization: "Bearer test-key" }),
      }),
    )
  } finally {
    fetchMock.mockRestore()
  }
})

test("requires the configured API key", () => {
  expect(
    createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKey: "   ",
      models: ["deepseek-flash"],
    }),
  ).rejects.toThrow("Missing DeepSeek API key")
})
