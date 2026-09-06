import { useEffect, useRef, useState } from 'react'
import type { Correction, TutorMessage, TutorSummary } from '@shared/types'

interface Props {
  sessionId: number
  onExit: () => void
  onComplete: (summary: TutorSummary, scenarioName: string) => void
}

export default function TutorChat({ sessionId, onExit, onComplete }: Props): React.JSX.Element {
  const [scenarioName, setScenarioName] = useState('')
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [vocabAddedTotal, setVocabAddedTotal] = useState(0)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.tutor.getSession(sessionId).then((session) => {
      setScenarioName(session.scenarioName)
      setMessages(session.transcript)
      setCorrections(session.corrections)
      const percent = session.plan.length === 0 ? 100 : Math.round((session.completedCheckpointIds.length / session.plan.length) * 100)
      setProgressPercent(percent)
    })
  }, [sessionId])

  useEffect(() => {
    const unsubscribe = window.api.tutor.onStreamChunk((streamSessionId, chunk) => {
      if (streamSessionId !== sessionId) return
      setStreamingText((prev) => prev + chunk)
    })
    return unsubscribe
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text }])
    setStreamingText('')
    setSending(true)

    try {
      const result = await window.api.tutor.sendMessage(sessionId, text)
      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply }])
      setStreamingText('')
      setCorrections((prev) => [...prev, ...result.corrections])
      setProgressPercent(result.progressPercent)
      setVocabAddedTotal((prev) => prev + result.vocabAdded.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  async function handleEndSession(): Promise<void> {
    setEnding(true)
    try {
      const summary = await window.api.tutor.endSession(sessionId, vocabAddedTotal)
      onComplete(summary, scenarioName)
    } finally {
      setEnding(false)
    }
  }

  return (
    <div className="tutor-chat">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Exit
        </button>
        <h3 className="tutor-scenario-name">{scenarioName}</h3>
        <button className="btn btn-primary" onClick={handleEndSession} disabled={ending}>
          End Session
        </button>
      </div>

      <div className="tutor-progress-bar">
        <div className="tutor-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="tutor-body">
        <div className="tutor-messages">
          {messages.map((m, i) => (
            <div key={i} className={`tutor-bubble tutor-bubble-${m.role}`}>
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="tutor-bubble tutor-bubble-assistant">{streamingText || '…'}</div>
          )}
          {error && <p className="tutor-error">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {corrections.length > 0 && (
          <div className="tutor-corrections">
            <h4>Corrections ({corrections.length})</h4>
            {corrections.map((c, i) => (
              <div key={i} className="tutor-correction">
                <p className="tutor-correction-mistake">✗ {c.mistake}</p>
                <p className="tutor-correction-fix">✓ {c.correction}</p>
                <p className="tutor-correction-explanation">{c.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="tutor-input-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="回复…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
