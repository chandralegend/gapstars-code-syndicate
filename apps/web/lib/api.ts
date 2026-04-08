import { createParser } from "eventsource-parser"

import { API_URL, type StreamChunk } from "@/lib/types"

/**
 * Sends a message to the FastAPI SSE streaming endpoint and yields parsed chunks.
 *
 * Yields chunks with:
 * - `token` — partial text token from the model
 * - `agent` — agent switch notification
 * - `thread_id` — final event (done)
 * - `detail` — error detail
 */
export async function* streamChat(
  message: string,
  threadId: string
): AsyncGenerator<StreamChunk, void, unknown> {
  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error("Response body is null")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  yield* readSSEStream(reader, decoder)
}

async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): AsyncGenerator<StreamChunk, void, unknown> {
  // Buffer incoming parsed events
  const buffer: StreamChunk[] = []
  let resolveNext: ((value: IteratorResult<StreamChunk>) => void) | null = null
  let streamDone = false

  function push(chunk: StreamChunk) {
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r({ value: chunk, done: false })
    } else {
      buffer.push(chunk)
    }
  }

  function finish() {
    streamDone = true
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r({ value: undefined as unknown as StreamChunk, done: true })
    }
  }

  // Live parser handles all SSE event types
  const liveParser = createParser({
    onEvent(event) {
      try {
        const data = JSON.parse(event.data)

        switch (event.event) {
          case "agent":
            push({ agent: data.agent })
            break
          case "token":
            push({ token: data.token })
            break
          case "done":
            push({ thread_id: data.thread_id })
            break
          case "error":
            push({ detail: data.detail })
            break
          default:
            // Unknown event type — try to parse generically
            push(data as StreamChunk)
        }
      } catch {
        /* skip non-JSON events */
      }
    },
  })

  // Read stream in the background
  const reading = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        liveParser.feed(decoder.decode(value, { stream: true }))
      }
    } finally {
      finish()
    }
  })()

  // Yield from the live buffer
  for (;;) {
    if (buffer.length > 0) {
      yield buffer.shift()!
    } else if (streamDone) {
      break
    } else {
      const result = await new Promise<IteratorResult<StreamChunk>>((resolve) => {
        resolveNext = resolve
      })
      if (result.done) break
      yield result.value
    }
  }

  await reading
}
