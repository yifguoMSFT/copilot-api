import { afterEach, expect, spyOn, test } from "bun:test"

import { createDeepSeekResponses } from "../src/services/deepseek/create-responses"

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const originalKey = process.env.DEEPSEEK_API_KEY

afterEach(() => {
  process.env.DEEPSEEK_API_KEY = originalKey
})

test("uses only DeepSeek authentication and disables redirects", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key"
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok"),
  )
  try {
    await createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://api.deepseek.com/",
      apiKeyEnv: "DEEPSEEK_API_KEY",
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
  delete process.env.DEEPSEEK_API_KEY
  expect(
    createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://api.deepseek.com",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      models: ["deepseek-flash"],
    }),
  ).rejects.toThrow("Missing DeepSeek API key")
})
