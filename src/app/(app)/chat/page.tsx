'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Loader2, Trash2, Sparkles } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I can see your protocols, inventory, and dose history. Ask me anything about your stack, timing, or what to try next.",
  timestamp: new Date().toISOString(),
}

const SUGGESTED_PROMPTS = [
  { label: "Today's plan", prompt: "What should I take today and when?" },
  { label: "My adherence", prompt: "How's my adherence been lately?" },
  { label: "Stack ideas", prompt: "What peptides would complement my current stack?" },
  { label: "Explain protocol", prompt: "Break down my current protocol and why each timing matters" },
]

function getStorageKey(userId: string | null) {
  return `peptrack-chat-${userId || 'default'}`
}

// Simple markdown renderer for bold, italics, and lists
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inList = false
  let listItems: string[] = []

  const processInlineMarkdown = (line: string, key: string) => {
    // Process bold (**text**) and italic (*text*)
    const parts: React.ReactNode[] = []
    let remaining = line
    let partIndex = 0

    while (remaining.length > 0) {
      // Check for bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // Check for italic (single asterisk, not followed by another)
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/)

      if (boldMatch && (!italicMatch || boldMatch.index! <= italicMatch.index!)) {
        const before = remaining.slice(0, boldMatch.index)
        if (before) parts.push(<span key={`${key}-${partIndex++}`}>{before}</span>)
        parts.push(<strong key={`${key}-${partIndex++}`} className="font-semibold">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index! + boldMatch[0].length)
      } else if (italicMatch) {
        const before = remaining.slice(0, italicMatch.index)
        if (before) parts.push(<span key={`${key}-${partIndex++}`}>{before}</span>)
        parts.push(<em key={`${key}-${partIndex++}`}>{italicMatch[1]}</em>)
        remaining = remaining.slice(italicMatch.index! + italicMatch[0].length)
      } else {
        parts.push(<span key={`${key}-${partIndex++}`}>{remaining}</span>)
        break
      }
    }

    return parts.length > 0 ? parts : line
  }

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i}>{processInlineMarkdown(item, `li-${elements.length}-${i}`)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
    inList = false
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()

    // Check for bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      inList = true
      listItems.push(trimmed.slice(2))
    } else if (trimmed.startsWith('* ') && !trimmed.startsWith('**')) {
      inList = true
      listItems.push(trimmed.slice(2))
    } else {
      flushList()

      // Check for headers
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={index} className="font-semibold text-sm mt-3 mb-1">
            {processInlineMarkdown(trimmed.slice(4), `h4-${index}`)}
          </h4>
        )
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={index} className="font-semibold mt-3 mb-1">
            {processInlineMarkdown(trimmed.slice(3), `h3-${index}`)}
          </h3>
        )
      } else if (trimmed === '') {
        elements.push(<div key={index} className="h-2" />)
      } else {
        elements.push(
          <p key={index} className="my-1">
            {processInlineMarkdown(trimmed, `p-${index}`)}
          </p>
        )
      }
    }
  })

  flushList()

  return <div className="space-y-0">{elements}</div>
}

export default function ChatPage() {
  const { currentUserId } = useAppStore()
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load messages from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(getStorageKey(currentUserId))
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      } catch (e) {
        console.error('Failed to parse stored messages')
      }
    }
    setIsHydrated(true)
  }, [currentUserId])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (isHydrated && messages.length > 1) {
      localStorage.setItem(getStorageKey(currentUserId), JSON.stringify(messages))
    }
  }, [messages, currentUserId, isHydrated])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  function clearChat() {
    setMessages([WELCOME_MESSAGE])
    localStorage.removeItem(getStorageKey(currentUserId))
  }

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          messages: updatedMessages.filter(m => m.id !== 'welcome'), // Send history for context
          userId: currentUserId,
        }),
      })

      const data = await res.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'Sorry, something went wrong.',
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handlePromptClick(prompt: string) {
    sendMessage(prompt)
  }

  const showSuggestions = messages.length <= 1 && !isLoading

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Clear button - only show if there's conversation history */}
      {messages.length > 1 && (
        <div className="flex justify-end px-4 pt-2">
          <button
            onClick={clearChat}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-3 max-w-[90%]',
              message.role === 'user' ? 'ml-auto flex-row-reverse' : ''
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                message.role === 'user'
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'bg-gradient-to-br from-emerald-400 to-cyan-500 text-white'
              )}
            >
              {message.role === 'user' ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-[15px] leading-relaxed',
                message.role === 'user'
                  ? 'bg-[var(--foreground)] text-[var(--background)] rounded-tr-sm'
                  : 'bg-[var(--muted)] text-[var(--foreground)] rounded-tl-sm'
              )}
            >
              {message.role === 'assistant' ? (
                renderMarkdown(message.content)
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </div>
          </div>
        ))}

        {/* Suggested Prompts */}
        {showSuggestions && (
          <div className="pt-4">
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mb-3">
              <Sparkles className="w-3 h-3" />
              Try asking
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handlePromptClick(item.prompt)}
                  className="px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--foreground)] hover:bg-[var(--muted)] hover:border-[var(--accent)] transition-all active:scale-95"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex gap-3 max-w-[90%]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-400 to-cyan-500 text-white">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-[var(--muted)] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input - z-60 to sit above bottom nav (z-50) */}
      <div className="border-t border-[var(--border)] bg-[var(--card)] p-3 pb-20 relative z-[60]">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end max-w-lg mx-auto">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent placeholder:text-[var(--muted-foreground)]"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0',
              input.trim() && !isLoading
                ? 'bg-[var(--accent)] text-white hover:opacity-90'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
