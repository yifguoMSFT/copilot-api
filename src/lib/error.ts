import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

import consola from "consola"

export class HTTPError extends Error {
  response: Response

  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

/**
 * An error the gateway itself raised, carrying the HTTP status the client
 * should see plus a stable machine-readable code. Used by model routing so a
 * rejected model selection never reaches an upstream.
 */
export class HttpStatusError extends Error {
  readonly code: string | undefined
  readonly status: ContentfulStatusCode

  constructor(status: ContentfulStatusCode, message: string, code?: string) {
    super(message)
    this.name = "HttpStatusError"
    this.status = status
    this.code = code
  }
}

export async function forwardError(c: Context, error: unknown) {
  consola.error("Error occurred:", error)

  if (error instanceof HTTPError) {
    const errorText = await error.response.text()
    let errorJson: unknown
    try {
      errorJson = JSON.parse(errorText)
    } catch {
      errorJson = errorText
    }
    consola.error("HTTP error:", errorJson)
    return c.json(
      {
        error: {
          message: errorText,
          type: "error",
        },
      },
      error.response.status as ContentfulStatusCode,
    )
  }

  const status = error instanceof HttpStatusError ? error.status : 500
  const code = error instanceof HttpStatusError ? error.code : undefined

  return c.json(
    {
      error: {
        message: (error as Error).message,
        type: "error",
        ...(code === undefined ? {} : { code }),
      },
    },
    status,
  )
}
