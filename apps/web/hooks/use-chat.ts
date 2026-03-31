"use client"

import { useCallback, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { streamChat } from "@/lib/api"
import { type ChatMessage } from "@/lib/types"

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadIdRef = useRef<string>(uuidv4())

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return

    setError(null)

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: content.trim(),
      createdAt: new Date(),
    }

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      createdAt: new Date(),
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setIsStreaming(true)

    try {
      for await (const chunk of streamChat(content.trim(), threadIdRef.current)) {
        if (chunk.token) {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk.token,
              }
            }
            return updated
          })
        }

        if (chunk.detail) {
          setError(chunk.detail)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
      // Remove the empty assistant message on error
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming])

  const resetThread = useCallback(() => {
    threadIdRef.current = uuidv4()
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    threadId: threadIdRef.current,
    sendMessage,
    resetThread,
  }
}
