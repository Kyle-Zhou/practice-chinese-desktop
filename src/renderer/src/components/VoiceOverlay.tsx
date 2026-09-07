import type { Correction, VoiceMode } from '@shared/types'
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
  voiceMode: VoiceMode
  onToggleVoiceMode: () => void
  /** Push-to-talk only: the orb is held down to record. */
  onPressStart: () => void
  onPressEnd: () => void
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

/**
 * Full-screen voice view. The orb reflects who is talking; in push-to-talk it doubles as the
 * record button, so the same screen works in both modes and the mode can be switched from the
 * control row without leaving the conversation.
 */
export default function VoiceOverlay(props: Props): React.JSX.Element {
  const { status, level, caption, lastUserText, latestCorrection, progress, themeName, error, ending, voiceMode } =
    props
  const scale = status === 'capturing' ? 1 + level * 0.6 : status === 'speaking' ? 1.08 : 1
  const pushToTalk = voiceMode === 'pushToTalk'

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
          title={
            pushToTalk
              ? 'Push to talk — click to switch to hands-free'
              : 'Hands-free — click to switch to push to talk'
          }
        >
          {pushToTalk ? '✋' : '🎙'}
        </button>
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
