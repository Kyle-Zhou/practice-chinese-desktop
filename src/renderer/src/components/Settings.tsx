import { useEffect, useState } from 'react'
import type {
  AppSettings,
  AppTheme,
  ReplyModelTier,
  SecretName,
  SttProvider,
  TtsProvider,
  VoiceMode
} from '@shared/types'

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']

const THEMES: { value: AppTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

interface Props {
  onExit: () => void
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
}

const SECRETS: { name: SecretName; title: string; placeholder: string; blurb: string }[] = [
  {
    name: 'anthropic',
    title: 'Anthropic API Key',
    placeholder: 'sk-ant-…',
    blurb: 'Powers the tutor conversation, corrections, and session summaries.'
  },
  {
    name: 'openai',
    title: 'OpenAI API Key',
    placeholder: 'sk-…',
    blurb: 'Used for speech recognition and the natural tutor voice (OpenAI transcription + text-to-speech).'
  }
]

export default function Settings({ onExit, theme, onThemeChange }: Props): React.JSX.Element {
  const [status, setStatus] = useState<Record<SecretName, boolean> | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [inputs, setInputs] = useState<Record<SecretName, string>>({ anthropic: '', openai: '' })
  const [savedName, setSavedName] = useState<SecretName | null>(null)

  useEffect(() => {
    window.api.settings.secretStatus().then(setStatus)
    window.api.settings.get().then(setSettings)
  }, [])

  async function handleSave(name: SecretName): Promise<void> {
    const trimmed = inputs[name].trim()
    if (!trimmed) return
    await window.api.settings.setSecret(name, trimmed)
    setInputs((prev) => ({ ...prev, [name]: '' }))
    setStatus((prev) => (prev ? { ...prev, [name]: true } : prev))
    setSavedName(name)
    setTimeout(() => setSavedName(null), 2000)
  }

  async function handleClear(name: SecretName): Promise<void> {
    if (!confirm('Remove the saved key?')) return
    await window.api.settings.clearSecret(name)
    setStatus((prev) => (prev ? { ...prev, [name]: false } : prev))
  }

  async function patch(update: Partial<AppSettings>): Promise<void> {
    setSettings(await window.api.settings.update(update))
  }

  if (!status || !settings) return <p>Loading…</p>

  return (
    <div className="settings">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to decks
        </button>
      </div>

      <div className="settings-card">
        <h3>Display</h3>
        <div className="settings-field">
          <span>Theme</span>
          <div className="settings-toggle-group">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`settings-toggle ${theme === t.value ? 'settings-toggle-active' : ''}`}
                onClick={() => onThemeChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="settings-field settings-field-inline">
          <input type="checkbox" checked={settings.showPinyin} onChange={(e) => patch({ showPinyin: e.target.checked })} />
          <span>Show pinyin everywhere</span>
        </label>
        <p className="deck-description">
          Applies to lessons, flashcards, and tutor captions. Turn it off once you want to lean on hanzi and sound
          instead of the romanization.
        </p>
      </div>

      {SECRETS.map((secret) => (
        <div key={secret.name} className="settings-card">
          <h3>{secret.title}</h3>
          <p className="deck-description">
            {secret.blurb} Keys are encrypted at rest with your OS keychain and only ever sent to that provider.
          </p>
          <p className="deck-stats">Status: {status[secret.name] ? 'a key is saved' : 'no key saved'}</p>
          <form
            className="new-deck-form"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave(secret.name)
            }}
          >
            <input
              type="password"
              aria-label={secret.title}
              placeholder={secret.placeholder}
              value={inputs[secret.name]}
              onChange={(e) => setInputs((prev) => ({ ...prev, [secret.name]: e.target.value }))}
            />
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </form>
          {savedName === secret.name && <p className="deck-stats">Saved.</p>}
          {status[secret.name] && (
            <button className="btn btn-danger" onClick={() => handleClear(secret.name)}>
              Remove key
            </button>
          )}
        </div>
      ))}

      <div className="settings-card">
        <h3>Speech recognition</h3>
        <p className="deck-description">
          How your voice is turned into text for the tutor. OpenAI is the zero-setup option; whisper.cpp runs fully
          offline (<code>brew install whisper-cpp</code>, then download a <code>ggml-small</code> or larger model).
        </p>
        <label className="settings-field">
          <span>Provider</span>
          <select value={settings.sttProvider} onChange={(e) => patch({ sttProvider: e.target.value as SttProvider })}>
            <option value="openai">OpenAI (gpt-4o-mini-transcribe)</option>
            <option value="whisper-cli">Local whisper.cpp</option>
          </select>
        </label>
        {settings.sttProvider === 'whisper-cli' && (
          <>
            <label className="settings-field">
              <span>whisper-cli binary</span>
              <input
                type="text"
                placeholder="/opt/homebrew/bin/whisper-cli"
                value={settings.whisperCliPath}
                onChange={(e) => setSettings({ ...settings, whisperCliPath: e.target.value })}
                onBlur={(e) => patch({ whisperCliPath: e.target.value.trim() })}
              />
            </label>
            <label className="settings-field">
              <span>Model file</span>
              <input
                type="text"
                placeholder="~/models/ggml-small.bin"
                value={settings.whisperModelPath}
                onChange={(e) => setSettings({ ...settings, whisperModelPath: e.target.value })}
                onBlur={(e) => patch({ whisperModelPath: e.target.value.trim() })}
              />
            </label>
          </>
        )}
      </div>

      <div className="settings-card">
        <h3>Conversation style</h3>
        <label className="settings-field">
          <span>Microphone</span>
          <select value={settings.voiceMode} onChange={(e) => patch({ voiceMode: e.target.value as VoiceMode })}>
            <option value="handsFree">Hands-free (just talk; interrupt any time)</option>
            <option value="pushToTalk">Push to talk (hold Space or the mic button)</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Tutor model</span>
          <select value={settings.replyModel} onChange={(e) => patch({ replyModel: e.target.value as ReplyModelTier })}>
            <option value="fast">Fast (Haiku 4.5) — lowest latency</option>
            <option value="smart">Smart (Sonnet 5) — better free conversation, ~2× cost</option>
          </select>
        </label>
      </div>

      <div className="settings-card">
        <h3>Tutor voice</h3>
        <label className="settings-field settings-field-inline">
          <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => patch({ autoSpeak: e.target.checked })} />
          <span>Read tutor replies aloud</span>
        </label>
        <label className="settings-field">
          <span>Voice</span>
          <select value={settings.ttsProvider} onChange={(e) => patch({ ttsProvider: e.target.value as TtsProvider })}>
            <option value="openai">Natural (OpenAI gpt-4o-mini-tts)</option>
            <option value="system">System voice (offline)</option>
          </select>
        </label>
        {settings.ttsProvider === 'openai' ? (
          <label className="settings-field">
            <span>OpenAI voice</span>
            <select value={settings.ttsVoice} onChange={(e) => patch({ ttsVoice: e.target.value })}>
              {OPENAI_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="deck-description">
            On macOS, install a higher-quality voice under System Settings → Accessibility → Spoken Content → System
            Voice → Manage Voices (e.g. “Tingting” or “Meijia” Premium). Note: the system voice bypasses echo
            cancellation, so hands-free interruption works best with headphones.
          </p>
        )}
      </div>

      <div className="settings-card">
        <h3>Credits</h3>
        <p className="deck-description">
          Dictionary lookups use{' '}
          <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict" target="_blank" rel="noreferrer">
            CC-CEDICT
          </a>
          , licensed{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          . Lesson example sentences come from{' '}
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer">
            Tatoeba
          </a>
          , licensed{' '}
          <a href="https://creativecommons.org/licenses/by/2.0/fr/" target="_blank" rel="noreferrer">
            CC BY 2.0 FR
          </a>
          .
        </p>
      </div>
    </div>
  )
}
