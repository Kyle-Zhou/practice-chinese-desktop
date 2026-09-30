import type { CorrectionMode, VoiceMode } from '@shared/types'

interface Props {
  correctionMode: CorrectionMode
  onCorrectionModeChange: (mode: CorrectionMode) => void
  voiceMode: VoiceMode
  onVoiceModeChange: (mode: VoiceMode) => void
  showPinyin: boolean
  onTogglePinyin: () => void
  showEnglish: boolean
  onToggleEnglish: () => void
  onClose: () => void
}

/**
 * One clear place for everything you'd otherwise change mid-conversation, so it doesn't end
 * up scattered across ad hoc toolbar buttons. Segmented controls for the two true "modes"
 * (correction style, microphone) match the Theme picker in Settings; the rest are switches.
 */
export default function TutorSessionSettings(props: Props): React.JSX.Element {
  const { correctionMode, voiceMode, showPinyin, showEnglish, onClose } = props

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <h3>Session settings</h3>

        <div className="settings-field">
          <span>Corrections</span>
          <div className="settings-toggle-group">
            <button
              type="button"
              className={`settings-toggle ${correctionMode === 'inline' ? 'settings-toggle-active' : ''}`}
              onClick={() => props.onCorrectionModeChange('inline')}
            >
              Corrects aloud
            </button>
            <button
              type="button"
              className={`settings-toggle ${correctionMode === 'silent' ? 'settings-toggle-active' : ''}`}
              onClick={() => props.onCorrectionModeChange('silent')}
            >
              Immersive
            </button>
          </div>
          <p className="deck-description">
            {correctionMode === 'inline'
              ? 'The tutor says the corrected sentence before continuing.'
              : 'The tutor stays in flow; corrections only show on screen.'}
          </p>
        </div>

        <div className="settings-field">
          <span>Microphone</span>
          <div className="settings-toggle-group">
            <button
              type="button"
              className={`settings-toggle ${voiceMode === 'pushToTalk' ? 'settings-toggle-active' : ''}`}
              onClick={() => props.onVoiceModeChange('pushToTalk')}
            >
              Push to talk
            </button>
            <button
              type="button"
              className={`settings-toggle ${voiceMode === 'handsFree' ? 'settings-toggle-active' : ''}`}
              onClick={() => props.onVoiceModeChange('handsFree')}
            >
              Hands-free
            </button>
          </div>
          <p className="deck-description">
            {voiceMode === 'pushToTalk'
              ? 'Hold the mic button or Space to talk.'
              : 'Just talk — the tutor listens continuously and you can interrupt any time.'}
          </p>
        </div>

        <label className="settings-field settings-field-inline">
          <input type="checkbox" checked={showPinyin} onChange={props.onTogglePinyin} />
          <span>Show pinyin</span>
        </label>
        <label className="settings-field settings-field-inline">
          <input type="checkbox" checked={showEnglish} onChange={props.onToggleEnglish} />
          <span>Show English</span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
