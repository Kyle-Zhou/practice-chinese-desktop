import { useCallback, useEffect, useRef, useState } from 'react'
import { nextCheckpoint, planProgress } from '@shared/plan'
import { speakableText } from '@shared/text'
import type {
  AppSettings,
  CorrectionMode,
  Correction,
  TutorMessage,
  TutorSession,
  VocabCandidate,
  VoiceMode
} from '@shared/types'
import { useTtsPlayer } from '../hooks/useTtsPlayer'
import { useVoiceLoop } from '../hooks/useVoiceLoop'
import SessionSummarizing from './SessionSummarizing'
import TutorSessionSettings from './TutorSessionSettings'
import VoiceOverlay, { type VoiceStatus } from './VoiceOverlay'

/** Matches the gear used for the app-wide Settings nav item, so "session settings" reads as the same concept. */
function GearIcon(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

interface Props {
  sessionId: number
  onExit: () => void
  onComplete: (sessionId: number) => void
}

type Phase = 'idle' | 'opening' | 'transcribing' | 'thinking' | 'replying' | 'analyzing'

/** Floor on how long the "wrapping up" screen stays visible, so it never flashes. */
const MIN_ENDING_MS = 700

/**
 * Typing is turned off for now: this user does all input by voice, so the typed-input screen
 * (message bubbles, text box, send button, and the plan/corrections/vocab sidebar) is
 * unreachable while this is false — nothing below was deleted, so flipping it back to `true`
 * restores the "⌨" button in the voice screen's control row and everything it leads to, with
 * no other changes needed. The live transcript people actually asked to keep is the side panel
 * in the voice screen instead (see `transcriptOpen` below).
 */
const KEYBOARD_MODE_ENABLED = false

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  sttProvider: 'openai',
  whisperCliPath: '',
  whisperModelPath: '',
  autoSpeak: true,
  ttsProvider: 'openai',
  ttsVoice: 'nova',
  voiceMode: 'pushToTalk',
  replyModel: 'fast',
  showPinyin: true,
  voiceShowEnglish: false
}

export default function TutorChat({ sessionId, onExit, onComplete }: Props): React.JSX.Element {
  const [session, setSession] = useState<TutorSession | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [vocabAdded, setVocabAdded] = useState<VocabCandidate[]>([])
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>('inline')
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voiceView, setVoiceView] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [lastSttMs, setLastSttMs] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** The in-flight turn (or opening) so a queued utterance waits for it before sending. */
  const turnRef = useRef<Promise<unknown> | null>(null)
  /** Set when the learner interrupts: remaining sentences of the current reply stay silent. */
  const ttsSuppressedRef = useRef(false)

  const effective = settings ?? DEFAULT_SETTINGS
  const tts = useTtsPlayer({ enabled: effective.autoSpeak, provider: effective.ttsProvider })

  // --- Session + settings load; the tutor speaks first on a fresh session ---
  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.settings.get(), window.api.tutor.getSession(sessionId)]).then(([s, sess]) => {
      if (cancelled) return
      setSettings(s)
      setSession(sess)
      setMessages(sess.transcript)
      setCorrections(sess.corrections)
      setCompletedIds(sess.completedCheckpointIds)
      setVocabAdded(sess.vocabAdded)
      setCorrectionMode(sess.correctionMode)
      if (sess.transcript.length === 0 && sess.status === 'active') {
        setPhase('opening')
        const opening = window.api.tutor.openSession(sessionId)
        turnRef.current = opening
        opening
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          .finally(() => {
            if (turnRef.current === opening) turnRef.current = null
            if (!cancelled) setPhase('idle')
          })
      }
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // --- Streamed events from the main process ---
  useEffect(() => {
    return window.api.tutor.onEvent((eventSessionId, event) => {
      if (eventSessionId !== sessionId) return
      switch (event.type) {
        case 'chunk':
          setPhase((p) => (p === 'opening' ? p : 'replying'))
          setStreamingText((prev) => prev + event.text)
          break
        case 'sentence':
          if (!ttsSuppressedRef.current) tts.speak(speakableText(event.text))
          break
        case 'replyDone':
          setMessages((prev) => [...prev, { role: 'assistant', text: event.text }])
          setStreamingText('')
          setPhase((p) => (p === 'opening' ? p : 'analyzing'))
          break
        case 'analysis':
          setCorrections((prev) => [...prev, ...event.corrections])
          setCompletedIds(event.completedCheckpointIds)
          setVocabAdded((prev) => [...prev, ...event.vocabAdded])
          break
      }
    })
  }, [sessionId, tts.speak])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // --- Sending turns (serialized: a queued utterance waits for the in-flight turn) ---
  const send = useCallback(
    async (text: string, source: TutorMessage['source']): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (turnRef.current) await turnRef.current.catch(() => undefined)
      setError(null)
      ttsSuppressedRef.current = false
      setMessages((prev) => [...prev, { role: 'user', text: trimmed, source }])
      setStreamingText('')
      setPhase('thinking')
      const turn = window.api.tutor.sendMessage(sessionId, trimmed, source)
      turnRef.current = turn
      try {
        await turn
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (turnRef.current === turn) {
          turnRef.current = null
          setPhase('idle')
        }
      }
    },
    [sessionId]
  )

  const handleUtterance = useCallback(
    async (wav: ArrayBuffer): Promise<void> => {
      setPhase('transcribing')
      setError(null)
      try {
        const result = await window.api.voice.transcribe(wav)
        setLastSttMs(result.durationMs)
        if (!result.text) {
          setPhase('idle')
          return
        }
        await send(result.text, 'voice')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setPhase('idle')
      }
    },
    [send]
  )

  const handleBargeIn = useCallback((): void => {
    ttsSuppressedRef.current = true
    tts.cancel()
  }, [tts.cancel])

  const micEnabled =
    session !== null && !ending && !muted && !paused && (voiceView || effective.voiceMode === 'pushToTalk')
  const voice = useVoiceLoop({
    mode: effective.voiceMode,
    enabled: micEnabled,
    listening: phase !== 'transcribing',
    ttsSpeaking: tts.speaking,
    onUtterance: handleUtterance,
    onBargeIn: handleBargeIn
  })

  // Hold Space to talk in push-to-talk mode (unless typing in the text box).
  useEffect(() => {
    if (effective.voiceMode !== 'pushToTalk') return
    const isTyping = (e: KeyboardEvent): boolean =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const onDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat || isTyping(e)) return
      e.preventDefault()
      voice.pressStart()
    }
    const onUp = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTyping(e)) return
      e.preventDefault()
      voice.pressEnd()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [effective.voiceMode, voice.pressStart, voice.pressEnd])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const text = input
    setInput('')
    await send(text, 'text')
  }

  async function handleEndSession(): Promise<void> {
    const startedAt = Date.now()
    setEnding(true)
    tts.cancel()
    // The summary usually takes seconds, but a cached summary or an early failure can come
    // back almost instantly — and a screen that appears for 100ms is a flicker, not feedback.
    const settle = async (): Promise<void> => {
      const remaining = MIN_ENDING_MS - (Date.now() - startedAt)
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    }
    try {
      if (turnRef.current) await turnRef.current.catch(() => undefined)
      await window.api.tutor.endSession(sessionId)
      await settle()
      onComplete(sessionId)
    } catch (err) {
      await settle()
      setError(err instanceof Error ? err.message : String(err))
      setEnding(false)
    }
  }

  function toggleAutoSpeak(): void {
    const next = !effective.autoSpeak
    setSettings({ ...effective, autoSpeak: next })
    if (!next) tts.cancel()
    void window.api.settings.update({ autoSpeak: next })
  }

  /**
   * How you take a turn is something you change mid-conversation (a room gets noisy, someone
   * walks in), so it lives in the session controls rather than only in Settings. The choice is
   * still persisted, so it carries to the next session.
   */
  function setVoiceMode(next: VoiceMode): void {
    if (next === effective.voiceMode) return
    // Flush anything being held down before the press handlers stop applying.
    if (voice.micState === 'capturing') voice.pressEnd()
    setSettings({ ...effective, voiceMode: next })
    // Hands-free only listens on the voice screen, so switching to it there goes with it.
    if (next === 'handsFree') setVoiceView(true)
    void window.api.settings.update({ voiceMode: next })
  }

  /** Freezes the mic and the tutor's voice in place; unlike ending the session, resuming picks up right where it left off. */
  function togglePause(): void {
    if (voice.micState === 'capturing') voice.pressEnd()
    setPaused((p) => {
      const next = !p
      if (next) tts.pause()
      else tts.resume()
      return next
    })
  }

  /**
   * How the tutor corrects mistakes is a session-time choice (a noisy room calls for silent
   * corrections; a focused review calls for spoken ones), so it's changeable mid-conversation
   * here rather than only at session start.
   */
  function setCorrectionModeAndPersist(next: CorrectionMode): void {
    if (next === correctionMode) return
    setCorrectionMode(next)
    void window.api.tutor.setCorrectionMode(sessionId, next)
  }

  function togglePinyin(): void {
    const next = !effective.showPinyin
    setSettings({ ...effective, showPinyin: next })
    void window.api.settings.update({ showPinyin: next })
  }

  function toggleVoiceEnglish(): void {
    const next = !effective.voiceShowEnglish
    setSettings({ ...effective, voiceShowEnglish: next })
    void window.api.settings.update({ voiceShowEnglish: next })
  }

  // Loading the session record, and — for a brand-new one — waiting on the tutor's opening
  // line to start streaming, are both "nothing to show yet" gaps. Same spinner as ending a
  // session, so starting one doesn't flash a different, plainer loading state.
  if (!session || !settings) return <SessionSummarizing />

  const progress = planProgress(session.plan, completedIds)

  if (ending) return <SessionSummarizing />
  if (phase === 'opening' && messages.length === 0 && !streamingText) return <SessionSummarizing />
  const next = nextCheckpoint(session.plan, completedIds)
  const busy = phase !== 'idle'
  const capturing = voice.micState === 'capturing'
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.text ?? null
  const lastTutor = [...messages].reverse().find((m) => m.role === 'assistant')?.text ?? ''
  const combinedError = error ?? voice.error ?? tts.error

  if (voiceView) {
    const status: VoiceStatus = paused
      ? 'paused'
      : muted
        ? 'muted'
        : voice.micState === 'starting' || voice.micState === 'off'
          ? 'connecting'
          : capturing
          ? 'capturing'
          : phase === 'transcribing'
            ? 'transcribing'
            : phase === 'thinking'
              ? 'thinking'
              : tts.speaking || phase === 'replying' || phase === 'opening'
                ? 'speaking'
                : 'listening'
    return (
      <>
        <VoiceOverlay
          status={status}
          micState={voice.micState}
          // Frozen while a modal is open: the orb's scale updates on every audio frame, and
          // that constant repaint underneath a translucent overlay is what caused the settings
          // panel's own text to visibly bleed through in Chromium.
          level={showSettings ? 0 : voice.level}
          caption={streamingText || lastTutor}
          lastUserText={lastUser}
          latestCorrection={corrections[corrections.length - 1] ?? null}
          progress={progress}
          themeName={session.scenarioName}
          error={combinedError}
          ending={ending}
          voiceMode={effective.voiceMode}
          messages={messages}
          streamingText={streamingText}
          transcriptOpen={transcriptOpen}
          onToggleTranscript={() => setTranscriptOpen((o) => !o)}
          onPressStart={voice.pressStart}
          onPressEnd={voice.pressEnd}
          onToggleMute={() => setMuted((m) => !m)}
          autoSpeak={effective.autoSpeak}
          onToggleAutoSpeak={toggleAutoSpeak}
          paused={paused}
          onTogglePause={togglePause}
          showPinyin={effective.showPinyin}
          showEnglish={effective.voiceShowEnglish}
          onOpenSettings={() => setShowSettings(true)}
          onShowChat={KEYBOARD_MODE_ENABLED ? () => setVoiceView(false) : undefined}
          onEnd={handleEndSession}
        />
        {showSettings && (
          <TutorSessionSettings
            correctionMode={correctionMode}
            onCorrectionModeChange={setCorrectionModeAndPersist}
            voiceMode={effective.voiceMode}
            onVoiceModeChange={setVoiceMode}
            showPinyin={effective.showPinyin}
            onTogglePinyin={togglePinyin}
            showEnglish={effective.voiceShowEnglish}
            onToggleEnglish={toggleVoiceEnglish}
            onClose={() => setShowSettings(false)}
          />
        )}
      </>
    )
  }

  // Typed-input screen: unreachable while KEYBOARD_MODE_ENABLED is false (see its definition
  // above), since nothing sets voiceView to false without it. Left intact so re-enabling the
  // flag is the only change needed to bring it back.
  return (
    <div className="tutor-chat">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Exit
        </button>
        <h3 className="tutor-scenario-name">{session.scenarioName}</h3>
        <div className="tutor-toolbar-actions">
          <button className="btn" onClick={() => setVoiceView(true)} title="Back to the voice screen">
            🎙 Voice
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setShowSettings(true)}
            aria-label="Session settings"
            title="Session settings"
          >
            <GearIcon />
          </button>
          <button className="btn btn-primary" onClick={handleEndSession} disabled={ending}>
            {ending ? 'Summarizing…' : progress === 100 ? 'Finish' : 'End Session'}
          </button>
        </div>
      </div>

      <div className="tutor-progress-bar" title={`${progress}% of the plan covered`}>
        <div className="tutor-progress-fill" style={{ '--progress': progress / 100 } as React.CSSProperties} />
      </div>

      <div className="tutor-layout">
        <div className="tutor-messages">
          {messages.map((m, i) => (
            <div key={i} className={`tutor-bubble tutor-bubble-${m.role}`}>
              {m.source === 'voice' && <span className="tutor-bubble-icon">🎤 </span>}
              {m.text}
            </div>
          ))}
          {(phase === 'opening' || phase === 'thinking' || phase === 'replying') && (
            <div className="tutor-bubble tutor-bubble-assistant">{streamingText || '…'}</div>
          )}
          {phase === 'transcribing' && <p className="tutor-status">Transcribing…</p>}
          {phase === 'analyzing' && <p className="tutor-status">Checking for corrections…</p>}
          {combinedError && <p className="tutor-error">{combinedError}</p>}
          <div ref={bottomRef} />
        </div>

        <aside className="tutor-sidebar">
          <div className="tutor-plan">
            <h4>
              {session.scenarioKind === 'conversation' ? 'Goals' : 'Plan'} · {progress}%
            </h4>
            <ol>
              {session.plan.map((c) => {
                const done = completedIds.includes(c.id)
                const isNext = session.scenarioKind === 'roleplay' && next?.id === c.id
                return (
                  <li key={c.id} className={done ? 'done' : isNext ? 'next' : ''}>
                    <span className="tutor-plan-mark">{done ? '✓' : isNext ? '→' : '·'}</span>
                    <span>
                      {c.description}
                      {!done && c.keyPhrases && c.keyPhrases.length > 0 && (
                        <span className="tutor-plan-hint">{c.keyPhrases.join(' · ')}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          {corrections.length > 0 && (
            <div className="tutor-corrections">
              <h4>Corrections ({corrections.length})</h4>
              {[...corrections].reverse().map((c, i) => (
                <div key={i} className="tutor-correction">
                  <p className="tutor-correction-mistake">✗ {c.mistake}</p>
                  <p className="tutor-correction-fix">✓ {c.correction}</p>
                  <p className="tutor-correction-explanation">{c.explanation}</p>
                </div>
              ))}
            </div>
          )}

          {vocabAdded.length > 0 && (
            <div className="tutor-vocab">
              <h4>New cards ({vocabAdded.length})</h4>
              <ul>
                {[...vocabAdded].reverse().map((v, i) => (
                  <li key={i}>
                    <span className="hanzi-inline">{v.hanzi}</span> {effective.showPinyin && `${v.pinyin} · `}
                    {v.english}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <form className="tutor-input-form" onSubmit={handleSubmit}>
        {settings.voiceMode === 'pushToTalk' && (
          <button
            type="button"
            className={`btn tutor-mic ${capturing ? 'tutor-mic-live' : ''}`}
            disabled={ending || voice.micState === 'starting' || voice.micState === 'off'}
            onMouseDown={voice.pressStart}
            onMouseUp={voice.pressEnd}
            onMouseLeave={capturing ? voice.pressEnd : undefined}
            title="Hold to talk (or hold Space)"
          >
            {capturing && <span className="tutor-mic-level" style={{ transform: `scale(${1 + voice.level})` }} />}
            🎤
          </button>
        )}
        <input
          type="text"
          placeholder={capturing ? 'Listening… release to send' : busy ? '…' : '回复…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || capturing}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
        {lastSttMs !== null && <span className="tutor-stt-ms">STT {lastSttMs} ms</span>}
      </form>

      {showSettings && (
        <TutorSessionSettings
          correctionMode={correctionMode}
          onCorrectionModeChange={setCorrectionModeAndPersist}
          voiceMode={effective.voiceMode}
          onVoiceModeChange={setVoiceMode}
          showPinyin={effective.showPinyin}
          onTogglePinyin={togglePinyin}
          showEnglish={effective.voiceShowEnglish}
          onToggleEnglish={toggleVoiceEnglish}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
