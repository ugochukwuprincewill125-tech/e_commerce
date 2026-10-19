import { Send, X, AlertCircle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { aiChatService } from '../../services/aiChatService'
import aiLogoSolid from '../../assets/AI-removebg-preview.png'

function extractReply(data) {
  if (!data) return 'No response from the assistant.'
  if (typeof data === 'string') return data
  if (data.response) return data.response
  if (data.reply) return data.reply
  if (data.content) return typeof data.content === 'string' ? data.content : JSON.stringify(data.content)
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content
  if (data.choices?.[0]?.text) return data.choices[0].text
  return JSON.stringify(data).slice(0, 300)
}

/**
 * Chat popup panel: message list, typing area, and loading/error states.
 * Fixed to the bottom-right of the viewport (same as the floating AI button).
 */
export default function AIChatWidget({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I’m your Shopping Assistant. Ask me about products, your orders, or getting around the store.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError(null)
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const data = await aiChatService.send(text, newMessages)
      const reply = extractReply(data)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'The assistant is currently unavailable.'
      setError(msg)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `I'm currently offline. ${msg}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="fixed bottom-24 z-[200] mx-auto flex h-[420px] w-full max-w-[95vw] flex-col rounded-xl border border-line bg-white shadow-2xl inset-x-4 sm:inset-x-auto sm:mx-0 sm:bottom-24 sm:right-6 sm:max-w-sm sm:h-[520px] lg:right-8 lg:max-w-[400px]">
      <div className="flex items-center justify-between rounded-t-xl bg-brand-800 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <img src={aiLogoSolid} alt="AI" className="h-8 w-8 object-contain" />
          <span className="font-semibold">Shopping Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label="Close chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {messages.map((msg, i) => (
          <div key={i} className={`max-w-[80%] ${msg.role === 'user' ? 'ml-auto text-right' : 'mr-auto'}`}>
            <div
              className={`inline-block rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-ink-950'
                  : 'bg-metal-100 text-ink-800'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="mr-auto max-w-[80%]">
            <div className="inline-block rounded-lg bg-metal-100 px-3 py-2 text-sm text-ink-800">
              <span className="inline-flex space-x-0.5">
                <span className="animate-bounce delay-75">.</span>
                <span className="animate-bounce delay-150">.</span>
                <span className="animate-bounce delay-300">.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 flex-none" />
          <span>{error}</span>
        </div>
      )}

      <div className="border-t border-line p-3">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a message… (Enter to send)"
            rows={2}
            maxLength={500}
            disabled={loading}
            className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-800"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="absolute bottom-2 right-2 rounded p-2 text-ink-500 disabled:cursor-not-allowed disabled:opacity-40 hover:text-brand-800"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
