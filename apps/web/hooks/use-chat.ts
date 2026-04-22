"use client"

import { useCallback, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { streamChat } from "@/lib/api"
import { type ActivityEvent, type AgentName, type ChatMessage } from "@/lib/types"

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentAgent, setCurrentAgent] = useState<AgentName | null>(null)
  const threadIdRef = useRef<string>(uuidv4())

  /** Helper: append an activity event to the last assistant message */
  const pushActivity = (event: ActivityEvent) => {
    setMessages((prev) => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          activity: [...last.activity, event],
        }
      }
      return updated
    })
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return

    setError(null)

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: content.trim(),
      createdAt: new Date(),
      activity: [],
    }

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      createdAt: new Date(),
      activity: [],
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setIsStreaming(true)

    try {
      for await (const chunk of streamChat(content.trim(), threadIdRef.current)) {
        // Handle agent switch events
        if (chunk.agent) {
          const agentName = chunk.agent
          setCurrentAgent(agentName)

          // Update the assistant message's agent
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                agent: agentName,
              }
            }
            return updated
          })

          // Add agent switch activity event
          pushActivity({
            type: "agent_switch",
            agent: agentName,
            from: chunk.agentFrom ?? null,
            timestamp: new Date(),
          })
        }

        // Handle tool call events
        if (chunk.toolCall) {
          pushActivity({
            type: "tool_call",
            tool: chunk.toolCall.tool,
            toolLabel: chunk.toolCall.toolLabel,
            args: chunk.toolCall.args,
            agent: chunk.toolCall.agent as AgentName,
            timestamp: new Date(),
          })
        }

        // Handle tool result events
        if (chunk.toolResult) {
          pushActivity({
            type: "tool_result",
            tool: chunk.toolResult.tool,
            toolLabel: chunk.toolResult.toolLabel,
            result: chunk.toolResult.result,
            agent: chunk.toolResult.agent as AgentName,
            timestamp: new Date(),
          })
        }

        // Handle token events
        if (chunk.token) {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === "assistant") {
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
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming])

  const resetThread = useCallback(() => {
    threadIdRef.current = uuidv4()
    setMessages([])
    setError(null)
    setCurrentAgent(null)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    currentAgent,
    threadId: threadIdRef.current,
    sendMessage,
    resetThread,
  }
}
