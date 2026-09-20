import type { Correction, VoiceMode } from '@shared/types'
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
  onToggleVoiceMode: () => void
  /** Push-to-talk only: the orb is held down to record. */
  onPressStart: () => void
  onPressEnd: () => void
  onToggleMute: () => void
  paused: boolean
  onTogglePause: () => void
  showPinyin: boolean
  onTogglePinyin: () => void
  showEnglish: boolean
  onToggleEnglish: () => void
  onShowChat: () => void
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

function HandIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path d="M8 13V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 11V5a1.5 1.5 0 0 1 3 0v7" />
      <path d="M17 11.5V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 13.7a1.5 1.5 0 0 1 2.4-1.8L8 13" />
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
 * Full-screen voice view. The orb reflects who is talking; in push-to-talk it doubles as the
 * record button, so the same screen works in both modes and the mode can be switched from the
 * control row without leaving the conversation.
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
    showPinyin,
    showEnglish
  } = props
  const scale = status === 'capturing' ? 1 + level * 0.6 : status === 'speaking' ? 1.08 : 1
  const pushToTalk = voiceMode === 'pushToTalk'
  const annotation = useTextAnnotation(caption, showPinyin || showEnglish)

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
        <div className="voice-caption-toggles">
          <button
            type="button"
            className={`voice-annotation-toggle ${showPinyin ? 'voice-annotation-toggle-active' : ''}`}
            onClick={props.onTogglePinyin}
            aria-pressed={showPinyin}
            title={showPinyin ? 'Hide pinyin' : 'Show pinyin'}
          >
            拼音
          </button>
          <button
            type="button"
            className={`voice-annotation-toggle ${showEnglish ? 'voice-annotation-toggle-active' : ''}`}
            onClick={props.onToggleEnglish}
            aria-pressed={showEnglish}
            title={showEnglish ? 'Hide English' : 'Show English'}
          >
            EN
          </button>
        </div>
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
          onClick={props.onToggleVoiceMode}
          aria-label={
            pushToTalk
              ? 'Push to talk — click to switch to hands-free'
              : 'Hands-free — click to switch to push to talk'
          }
          title={
            pushToTalk
              ? 'Push to talk — click to switch to hands-free'
              : 'Hands-free — click to switch to push to talk'
          }
        >
          {pushToTalk ? <HandIcon /> : <MicIcon />}
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
          className={`voice-control ${paused ? 'voice-control-active' : ''}`}
          onClick={props.onTogglePause}
          aria-label={paused ? 'Resume conversation' : 'Pause conversation'}
          title={paused ? 'Resume conversation' : 'Pause conversation'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button
          className="voice-control"
          onClick={props.onShowChat}
          aria-label="Show transcript and type"
          title="Show transcript and type"
        >
          <KeyboardIcon />
        </button>
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
    </div>
  )
}
