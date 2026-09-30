import { useEffect, useState } from 'react'
import type { AppSettings, Scenario, SecretName, TutorSessionSummaryRow } from '@shared/types'

interface Props {
  onOpenSession: (sessionId: number) => void
  onViewHistory: () => void
  onOpenSettings: () => void
}

export default function TutorScenarioPicker({ onOpenSession, onViewHistory, onOpenSettings }: Props): React.JSX.Element {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [sessions, setSessions] = useState<TutorSessionSummaryRow[]>([])
  const [secrets, setSecrets] = useState<Record<SecretName, boolean> | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [starting, setStarting] = useState(false)
  const [themePrompt, setThemePrompt] = useState('')
  const [creatingTheme, setCreatingTheme] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const [scenarioList, sessionList, secretStatus, appSettings] = await Promise.all([
      window.api.tutor.listScenarios(),
      window.api.tutor.listSessions(),
      window.api.settings.secretStatus(),
      window.api.settings.get()
    ])
    setScenarios(scenarioList)
    setSessions(sessionList)
    setSecrets(secretStatus)
    setSettings(appSettings)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleStart(scenarioId: number): Promise<void> {
    setStarting(true)
    setError(null)
    try {
      const session = await window.api.tutor.startSession({ scenarioId })
      onOpenSession(session.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleCreateTheme(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const prompt = themePrompt.trim()
    if (!prompt) return
    setCreatingTheme(true)
    setError(null)
    try {
      const scenario = await window.api.tutor.createTheme(prompt)
      setThemePrompt('')
      await refresh()
      await handleStart(scenario.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingTheme(false)
    }
  }

  async function handleDeleteSession(sessionId: number): Promise<void> {
    if (!confirm('Delete this session and its history?')) return
    await window.api.tutor.deleteSession(sessionId)
    await refresh()
  }

  async function handleDeleteScenario(id: number): Promise<void> {
    if (!confirm('Delete this theme? Sessions that used it will be deleted too.')) return
    await window.api.tutor.deleteScenario(id)
    await refresh()
  }

  if (scenarios === null || secrets === null || settings === null) return <p>Loading…</p>

  const canChat = secrets.anthropic
  const sttReady =
    settings.sttProvider === 'openai' ? secrets.openai : Boolean(settings.whisperCliPath && settings.whisperModelPath)
  const ttsReady = settings.ttsProvider === 'system' || secrets.openai
  const active = sessions.filter((s) => s.status === 'active')
  const hasPastSessions = sessions.some((s) => s.status === 'completed')
  const conversations = scenarios.filter((s) => s.kind === 'conversation')
  const roleplays = scenarios.filter((s) => s.kind === 'roleplay')

  const scenarioCard = (scenario: Scenario): React.JSX.Element => (
    <li key={scenario.id} className="deck-card">
      <div className="deck-card-info">
        <h3>{scenario.name}</h3>
        <p className="deck-description">{scenario.description}</p>
        <p className="deck-stats">
          {scenario.plan.length} {scenario.kind === 'conversation' ? 'goals' : 'steps'}
          {scenario.kind === 'roleplay' && ` · tutor plays ${scenario.tutorRole}`}
          {scenario.custom && ' · custom'}
        </p>
      </div>
      <div className="deck-card-actions">
        <button className="btn btn-primary" disabled={!canChat || starting} onClick={() => handleStart(scenario.id)}>
          Start
        </button>
        {scenario.custom && (
          <button className="btn btn-danger" onClick={() => handleDeleteScenario(scenario.id)}>
            Delete
          </button>
        )}
      </div>
    </li>
  )

  return (
    <div className="deck-list">
      <div className="study-toolbar">
        <h2>AI Tutor</h2>
        {hasPastSessions && (
          <button className="btn" onClick={onViewHistory}>
            Past sessions
          </button>
        )}
      </div>

      {!canChat && (
        <p className="tutor-error">
          Add an Anthropic API key in <a onClick={onOpenSettings}>Settings</a> before starting a session.
        </p>
      )}
      {canChat && (!sttReady || !ttsReady) && (
        <p className="deck-description">
          {!sttReady && 'Voice input isn’t configured (text still works). '}
          {!ttsReady && 'The natural tutor voice needs an OpenAI key; the system voice will be used instead. '}
          Fix this in <a onClick={onOpenSettings}>Settings</a>.
        </p>
      )}
      {error && <p className="tutor-error">{error}</p>}

      {active.length > 0 && (
        <>
          <h3 className="section-title">Continue</h3>
          <ul className="deck-cards">
            {active.map((s) => (
              <li key={s.id} className="deck-card">
                <div className="deck-card-info">
                  <h3>{s.scenarioName}</h3>
                  <p className="deck-stats">
                    {s.progressPercent}% · {s.turnCount} turn{s.turnCount === 1 ? '' : 's'} ·{' '}
                    {new Date(s.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="deck-card-actions">
                  <button className="btn btn-primary" disabled={!canChat} onClick={() => onOpenSession(s.id)}>
                    Resume
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDeleteSession(s.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="section-title">Free conversation</h3>
      <form className="new-deck-form" onSubmit={handleCreateTheme}>
        <input
          type="text"
          placeholder="Your own theme, e.g. “my trip to Chengdu” or “practice 把 sentences”…"
          value={themePrompt}
          onChange={(e) => setThemePrompt(e.target.value)}
          disabled={!canChat || creatingTheme}
        />
        <button className="btn btn-primary" type="submit" disabled={!canChat || creatingTheme || !themePrompt.trim()}>
          {creatingTheme ? 'Designing lesson…' : 'Create & start'}
        </button>
      </form>
      <ul className="deck-cards">{conversations.map(scenarioCard)}</ul>

      <h3 className="section-title">Role-play</h3>
      <ul className="deck-cards">{roleplays.map(scenarioCard)}</ul>
    </div>
  )
}
