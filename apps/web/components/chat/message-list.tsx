"use client"

import { useEffect, useRef } from "react"
import { Bot, User } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { type ChatMessage } from "@/lib/types"

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Bot className="size-12 opacity-30" />
        <div>
          <p className="text-base font-medium">Multi-Agent Starter</p>
          <p className="text-sm">
            Ask anything — the agent can tell the time or do math.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex gap-1">
              <span className="animate-bounce [animation-delay:-0.3s]">●</span>
              <span className="animate-bounce [animation-delay:-0.15s]">●</span>
              <span className="animate-bounce">●</span>
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {message.content || (
          <span className="text-muted-foreground italic">Thinking…</span>
        )}
      </div>
    </div>
  )
}
