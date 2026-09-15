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

test("forwards session-id header when provided", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok"),
  )
  try {
    const headers = new Headers({ "session-id": "test-session-123" })
    await createDeepSeekResponses(
      "{}",
      {
        enabled: true,
        baseUrl: "https://api.deepseek.com/",
        apiKey: "test-key",
        models: ["deepseek-flash"],
      },
      { headers },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-key",
          "session-id": "test-session-123",
        }),
      }),
    )
  } finally {
    fetchMock.mockRestore()
  }
})

test("forwards x-opencode-session header when provided", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ ok: true }),
  )
  try {
    const headers = new Headers({ "x-opencode-session": "opencode-session-1" })
    await createDeepSeekResponses(
      "{}",
      {
        enabled: true,
        baseUrl: "https://opencode.ai/zen/go/v1/responses",
        apiKey: "test-key",
        models: ["deepseek-v4.1-flash"],
      },
      { headers },
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)["x-opencode-session"]).toBe(
      "opencode-session-1",
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

test("uses a base URL that already names the Responses endpoint", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok"),
  )
  try {
    await createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://opencode.ai/zen/go/v1/responses",
      apiKey: "test-key",
      models: ["deepseek-flash"],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/responses",
      expect.objectContaining({ redirect: "manual" }),
    )
  } finally {
    fetchMock.mockRestore()
  }
})

test("appends the Responses path to a base URL without one", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok"),
  )
  try {
    await createDeepSeekResponses("{}", {
      enabled: true,
      baseUrl: "https://opencode.ai/zen/go/v1/",
      apiKey: "test-key",
      models: ["deepseek-flash"],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/responses",
      expect.objectContaining({ redirect: "manual" }),
    )
  } finally {
    fetchMock.mockRestore()
  }
})
