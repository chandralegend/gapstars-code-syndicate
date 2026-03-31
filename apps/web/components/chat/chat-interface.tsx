"use client"

import { RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageInput } from "@/components/chat/message-input"
import { MessageList } from "@/components/chat/message-list"
import { useChat } from "@/hooks/use-chat"

export function ChatInterface() {
  const { messages, isStreaming, error, threadId, sendMessage, resetThread } = useChat()

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Multi-Agent Starter</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {threadId.slice(0, 8)}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={resetThread}
          title="New conversation"
          aria-label="New conversation"
        >
          <RotateCcw className="size-4" />
        </Button>
      </header>

      {/* Messages */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Input */}
      <MessageInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
