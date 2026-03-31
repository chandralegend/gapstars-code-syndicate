import { createParser } from "eventsource-parser"

import { API_URL, type StreamChunk } from "@/lib/types"

/**
 * Sends a message to the FastAPI SSE streaming endpoint and yields parsed chunks.
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

  // Collect all chunks first, then yield them
  // For large responses we stream token-by-token via a readable-stream approach
  const allChunks: StreamChunk[] = []
  let parseError: Error | null = null

  const parser = createParser({
    onEvent(event) {
      try {
        const chunk = JSON.parse(event.data) as StreamChunk
        allChunks.push(chunk)
      } catch {
        // ignore non-JSON events
      }
    },
  })

  // We need real streaming — use a transform approach with manual iteration
  // Re-implement using a simple push-based async iterable
  yield* readSSEStream(reader, decoder, parser, allChunks)
}

async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  parser: ReturnType<typeof createParser>,
  _unused: StreamChunk[]
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

  // Override parser to push into buffer
  const liveParser = createParser({
    onEvent(event) {
      try {
        push(JSON.parse(event.data) as StreamChunk)
      } catch {
        /* skip */
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
