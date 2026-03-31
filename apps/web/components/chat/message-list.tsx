"use client"

import { useEffect, useRef } from "react"
import { Bot, User } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
        {!message.content ? (
          <span className="italic opacity-60">Thinking…</span>
        ) : isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Paragraphs — tight spacing inside bubbles
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        // Headings
        h1: ({ children }) => (
          <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        // Inline code
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-")
          if (isBlock) {
            return (
              <code
                className={cn(
                  "block w-full overflow-x-auto rounded-md bg-black/10 px-3 py-2 font-mono text-xs dark:bg-white/10",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          }
          return (
            <code
              className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10"
              {...props}
            >
              {children}
            </code>
          )
        },
        // Code blocks
        pre: ({ children }) => (
          <pre className="mb-2 mt-1 overflow-x-auto rounded-md bg-black/10 dark:bg-white/10">
            {children}
          </pre>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-current pl-3 opacity-70">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="my-2 border-current opacity-20" />,
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            {children}
          </a>
        ),
        // Bold / italic
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        // Tables (GFM)
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-current/20 px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-current/20 px-2 py-1">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
