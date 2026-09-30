import { useEffect, useRef } from 'react'
import type { Correction, TutorMessage, VoiceMode } from '@shared/types'
import type { MicState } from '../hooks/useVoiceLoop'
import { useTextAnnotation } from '../hooks/useTextAnnotation'

export type VoiceStatus =
  | 'connecting'
  | 'listening'
  | 'capturing'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'paused'

interface Props {
  status: VoiceStatus
  micState: MicState
  level: number
  caption: string
  lastUserText: string | null
  latestCorrection: Correction | null
  progress: number
  themeName: string
  error: string | null
  voiceMode: VoiceMode
  /** Push-to-talk only: the orb is held down to record. */
  onPressStart: () => void
  onPressEnd: () => void
  onToggleMute: () => void
  /** Deafen: stop hearing the tutor without affecting your own mic. */
  autoSpeak: boolean
  onToggleAutoSpeak: () => void
  paused: boolean
  onTogglePause: () => void
  showPinyin: boolean
  showEnglish: boolean
  onOpenSettings: () => void
  /** The full conversation so far, for the transcript side panel. */
  messages: TutorMessage[]
  /** The tutor's reply as it streams in, appended live at the bottom of the transcript. */
  streamingText: string
  transcriptOpen: boolean
  onToggleTranscript: () => void
  /** Undefined while typed input is disabled — the button that leads to it is simply not shown. */
  onShowChat?: () => void
  onEnd: () => void
  ending: boolean
}

const LABELS: Record<VoiceStatus, string> = {
  connecting: 'Connecting…',
  listening: 'Listening',
  capturing: 'Listening…',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  muted: 'Muted',
  paused: 'Paused'
}

/** The four voice-control icons, drawn to match the app's existing stroke-icon convention
 * (see the settings gear in App.tsx) instead of relying on emoji, whose rendering and
 * accessible name vary by OS and font. Each button supplies its own aria-label, so these stay
 * decorative. */
function iconProps(): React.SVGProps<SVGSVGElement> {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }
}

function MicIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  )
}

function MicOffIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path d="M9 9v3a3 3 0 0 0 4.5 2.6" />
      <path d="M15 9V5a3 3 0 0 0-5.7-1.3" />
      <path d="M17 10a5 5 0 0 1-.8 2.7" />
      <path d="M6.6 6.6A5 5 0 0 0 7 10" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

function SpeakerIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <polygon points="10 5 5 9 2 9 2 15 5 15 10 19 10 5" />
      <path d="M14.5 8.5a5 5 0 0 1 0 7" />
      <path d="M17.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

function SpeakerOffIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <polygon points="10 5 5 9 2 9 2 15 5 15 10 19 10 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  )
}

/** Matches the gear used for the app-wide Settings nav item, so "session settings" reads as the same concept. */
function GearIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function TranscriptIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  )
}

function KeyboardIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="6" y1="14" x2="18" y2="14" />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path d="M7 4v16l14-8z" />
    </svg>
  )
}

function EndIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  )
}

/**
 * One transcript row. Pinyin/English follow the same two toggles as the live caption, and
 * apply to both sides of the conversation — your own voice-transcribed Chinese benefits from
 * the same reading help as the tutor's. `useTextAnnotation` does one dictionary lookup per
 * bubble, which is why this is its own component rather than inline in a `.map`.
 */
function TranscriptBubble({
  message,
  showPinyin,
  showEnglish
}: {
  message: TutorMessage
  showPinyin: boolean
  showEnglish: boolean
}): React.JSX.Element {
  const annotation = useTextAnnotation(message.text, showPinyin, showEnglish)
  return (
    <div className={`tutor-bubble tutor-bubble-${message.role}`}>
      {message.source === 'voice' && <span className="tutor-bubble-icon">🎤 </span>}
      {message.text}
      {showPinyin && annotation.pinyin && <p className="voice-transcript-pinyin">{annotation.pinyin}</p>}
      {showEnglish && annotation.english && <p className="voice-transcript-english">{annotation.english}</p>}
    </div>
  )
}

/**
 * Full-screen voice view. The orb reflects who is talking; in push-to-talk it doubles as the
 * record button, so the same screen works in both modes. Every other configurable — voice
 * mode included — lives behind the settings gear in the control row, so switching never
 * requires leaving the conversation.
 */
export default function VoiceOverlay(props: Props): React.JSX.Element {
  const {
    status,
    level,
    caption,
    lastUserText,
    latestCorrection,
    progress,
    themeName,
    error,
    ending,
    voiceMode,
    paused,
    autoSpeak,
    showPinyin,
    showEnglish,
    messages,
    streamingText,
    transcriptOpen
  } = props
  const scale = status === 'capturing' ? 1 + level * 0.6 : status === 'speaking' ? 1.08 : 1
  const pushToTalk = voiceMode === 'pushToTalk'
  const annotation = useTextAnnotation(caption, showPinyin, showEnglish)

  const transcriptEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (transcriptOpen) transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcriptOpen, messages, streamingText])

  // Idle in push-to-talk is "waiting for you to press", not "listening" — the orb shouldn't
  // breathe as though it were already hearing you.
  const idlePtt = pushToTalk && status === 'listening'
  const orbStatus = idlePtt ? 'ready' : status
  const label = idlePtt ? 'Hold to talk' : LABELS[status]

  const orbClass = `voice-orb voice-orb-${orbStatus}${pushToTalk ? ' voice-orb-pressable' : ''}`
  const orbStyle = { transform: `scale(${scale})` }

  return (
    <div className="voice-overlay">
      <div className="voice-topline">
        <span className="voice-theme">{themeName}</span>
        <span className="voice-progress">{progress}%</span>
      </div>

      <div className="voice-stage">
        {pushToTalk ? (
          <button
            type="button"
            className={orbClass}
            style={orbStyle}
            onMouseDown={props.onPressStart}
            onMouseUp={props.onPressEnd}
            onMouseLeave={status === 'capturing' ? props.onPressEnd : undefined}
            title="Hold to talk (or hold Space)"
          />
        ) : (
          <div className={orbClass} style={orbStyle} />
        )}
        <p className="voice-status">{label}</p>
      </div>

      <div className="voice-captions">
        {lastUserText && <p className="voice-caption-user">{lastUserText}</p>}
        <p className="voice-caption-tutor">{caption || ' '}</p>
        {showPinyin && annotation.pinyin && <p className="voice-caption-pinyin">{annotation.pinyin}</p>}
        {showEnglish && annotation.english && <p className="voice-caption-english">{annotation.english}</p>}
        {latestCorrection && (
          <div className="voice-correction">
            <span className="tutor-correction-mistake">✗ {latestCorrection.mistake}</span>
            <span className="tutor-correction-fix">✓ {latestCorrection.correction}</span>
            <span className="tutor-correction-explanation">{latestCorrection.explanation}</span>
          </div>
        )}
        {error && <p className="tutor-error">{error}</p>}
      </div>

      <div className="voice-controls">
        <button
          className="voice-control"
          onClick={props.onOpenSettings}
          aria-label="Session settings"
          title="Session settings"
        >
          <GearIcon />
        </button>
        <button
          className={`voice-control ${status === 'muted' ? 'voice-control-active' : ''}`}
          onClick={props.onToggleMute}
          disabled={paused}
          aria-label={status === 'muted' ? 'Unmute microphone' : 'Mute microphone'}
          title={status === 'muted' ? 'Unmute microphone' : 'Mute microphone'}
        >
          {status === 'muted' ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          className={`voice-control ${!autoSpeak ? 'voice-control-active' : ''}`}
          onClick={props.onToggleAutoSpeak}
          aria-label={autoSpeak ? 'Deafen: stop hearing the tutor' : 'Undeafen: hear the tutor again'}
          title={autoSpeak ? 'Deafen: stop hearing the tutor' : 'Undeafen: hear the tutor again'}
        >
          {autoSpeak ? <SpeakerIcon /> : <SpeakerOffIcon />}
        </button>
        <button
          className={`voice-control ${paused ? 'voice-control-active' : ''}`}
          onClick={props.onTogglePause}
          aria-label={paused ? 'Resume conversation' : 'Pause conversation'}
          title={paused ? 'Resume conversation' : 'Pause conversation'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          className={`voice-control ${transcriptOpen ? 'voice-control-active' : ''}`}
          onClick={props.onToggleTranscript}
          aria-label={transcriptOpen ? 'Hide transcript' : 'Show transcript'}
          title={transcriptOpen ? 'Hide transcript' : 'Show transcript'}
        >
          <TranscriptIcon />
        </button>
        {props.onShowChat && (
          <button
            className="voice-control"
            onClick={props.onShowChat}
            aria-label="Switch to typed input"
            title="Switch to typed input"
          >
            <KeyboardIcon />
          </button>
        )}
        <button
          className="voice-control voice-control-end"
          onClick={props.onEnd}
          disabled={ending}
          aria-label="End session"
          title="End session"
        >
          {ending ? '…' : <EndIcon />}
        </button>
      </div>

      {transcriptOpen && (
        <aside className="voice-transcript">
          <div className="voice-transcript-header">
            <span>Transcript</span>
            <button className="btn btn-icon voice-transcript-close" onClick={props.onToggleTranscript} aria-label="Close transcript">
              <CloseIcon />
            </button>
          </div>
          <div className="voice-transcript-messages">
            {messages.map((m, i) => (
              <TranscriptBubble key={i} message={m} showPinyin={showPinyin} showEnglish={showEnglish} />
            ))}
            {streamingText && (
              <TranscriptBubble
                message={{ role: 'assistant', text: streamingText }}
                showPinyin={showPinyin}
                showEnglish={showEnglish}
              />
            )}
            <div ref={transcriptEndRef} />
          </div>
        </aside>
      )}
    </div>
  )
}
