import { useEffect, useState } from 'react'

interface Props {
  onExit: () => void
}

export default function Settings({ onExit }: Props): React.JSX.Element {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.hasApiKey().then(setHasKey)
  }, [])

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = keyInput.trim()
    if (!trimmed) return
    await window.api.settings.setApiKey(trimmed)
    setKeyInput('')
    setHasKey(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleClear(): Promise<void> {
    if (!confirm('Remove the saved Anthropic API key?')) return
    await window.api.settings.clearApiKey()
    setHasKey(false)
  }

  return (
    <div className="settings">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to decks
        </button>
      </div>

      <div className="settings-card">
        <h3>Anthropic API Key</h3>
        <p className="deck-description">
          Required for the AI Tutor feature. Your key is encrypted at rest using your OS keychain and never leaves
          this device except to call the Anthropic API directly.
        </p>
        <p className="deck-stats">
          Status: {hasKey === null ? 'checking…' : hasKey ? 'a key is saved' : 'no key saved'}
        </p>
        <form className="new-deck-form" onSubmit={handleSave}>
          <input
            type="password"
            placeholder="sk-ant-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </form>
        {saved && <p className="deck-stats">Saved.</p>}
        {hasKey && (
          <button className="btn btn-danger" onClick={handleClear}>
            Remove key
          </button>
        )}
      </div>
    </div>
  )
}
