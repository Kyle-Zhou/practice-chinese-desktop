import type { Correction } from '@shared/types'
import type { MicState } from '../hooks/useVoiceLoop'

export type VoiceStatus = 'connecting' | 'listening' | 'capturing' | 'transcribing' | 'thinking' | 'speaking' | 'muted'

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
  onToggleMute: () => void
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
  muted: 'Muted'
}

/** Full-screen hands-free view: one orb that reflects who is talking, captions, and three controls. */
export default function VoiceOverlay(props: Props): React.JSX.Element {
  const { status, level, caption, lastUserText, latestCorrection, progress, themeName, error, ending } = props
  const scale = status === 'capturing' ? 1 + level * 0.6 : status === 'speaking' ? 1.08 : 1

  return (
    <div className="voice-overlay">
      <div className="voice-topline">
        <span className="voice-theme">{themeName}</span>
        <span className="voice-progress">{progress}%</span>
      </div>

      <div className="voice-stage">
        <div className={`voice-orb voice-orb-${status}`} style={{ transform: `scale(${scale})` }} />
        <p className="voice-status">{LABELS[status]}</p>
      </div>

      <div className="voice-captions">
        {lastUserText && <p className="voice-caption-user">{lastUserText}</p>}
        <p className="voice-caption-tutor">{caption || ' '}</p>
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
          className={`voice-control ${status === 'muted' ? 'voice-control-active' : ''}`}
          onClick={props.onToggleMute}
          title={status === 'muted' ? 'Unmute microphone' : 'Mute microphone'}
        >
          {status === 'muted' ? '🎤' : '🔇'}
        </button>
        <button className="voice-control" onClick={props.onShowChat} title="Show transcript and type">
          ⌨️
        </button>
        <button className="voice-control voice-control-end" onClick={props.onEnd} disabled={ending} title="End session">
          {ending ? '…' : '✕'}
        </button>
      </div>
    </div>
  )
}
