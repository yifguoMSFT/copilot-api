import { expect, test } from "bun:test"

import { compactionMetadataSource } from "../src/lib/compaction-routing"

const name = "x-codex-turn-metadata"
const compact = JSON.stringify({ request_kind: "compaction" })
const body = { client_metadata: { [name]: compact } }

test.each(["manual", "automatic"])("detects %s compaction", (trigger) => {
  const header = JSON.stringify({
    request_kind: "compaction",
    compaction: { trigger, implementation: "responses" },
  })
  expect(compactionMetadataSource(new Headers({ [name]: header }), {})).toBe(
    "header",
  )
})

test("uses body metadata only when header is absent", () => {
  expect(compactionMetadataSource(new Headers(), body)).toBe("body")
  for (const header of ["", "broken", '{"request_kind":"turn"}']) {
    expect(
      compactionMetadataSource(new Headers({ [name]: header }), body),
    ).toBeUndefined()
  }
  expect(
    compactionMetadataSource(new Headers({ [name]: compact }), {
      client_metadata: { [name]: '{"request_kind":"turn"}' },
    }),
  ).toBe("header")
})

test.each(
  [
    undefined,
    null,
    [],
    1,
    {},
    "broken",
    "null",
    "[]",
    "1",
    '{"request_kind":"turn"}',
    '{"request_kind":"Compaction"}',
    '{"compaction":{"trigger":"manual"}}',
  ].map((metadata) => ({ metadata })),
)("ignores invalid or non-compaction metadata %j", ({ metadata }) => {
  expect(
    compactionMetadataSource(new Headers(), {
      client_metadata: { [name]: metadata },
    }),
  ).toBeUndefined()
  if (typeof metadata === "string") {
    expect(
      compactionMetadataSource(new Headers({ [name]: metadata }), {}),
    ).toBeUndefined()
  }
})

test.each(
  [undefined, null, [], "invalid"].map((clientMetadata) => ({
    clientMetadata,
  })),
)("ignores malformed client_metadata %j", ({ clientMetadata }) => {
  expect(
    compactionMetadataSource(new Headers(), {
      client_metadata: clientMetadata,
    }),
  ).toBeUndefined()
})

test("does not infer compaction from current or historical prompt text", () => {
  expect(
    compactionMetadataSource(new Headers(), {
      input: [
        { role: "assistant", content: "CONTEXT CHECKPOINT COMPACTION" },
        {
          role: "user",
          content: "You are performing a CONTEXT CHECKPOINT COMPACTION",
        },
      ],
    }),
  ).toBeUndefined()
})
