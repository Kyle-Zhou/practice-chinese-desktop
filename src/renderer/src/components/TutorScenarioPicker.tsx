import { useEffect, useState } from 'react'
import type { Scenario } from '@shared/types'

interface Props {
  onExit: () => void
  onStart: (sessionId: number) => void
}

export default function TutorScenarioPicker({ onExit, onStart }: Props): React.JSX.Element {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    window.api.tutor.listScenarios().then(setScenarios)
    window.api.settings.hasApiKey().then(setHasKey)
  }, [])

  async function handleStart(scenarioId: number): Promise<void> {
    setStarting(true)
    try {
      const session = await window.api.tutor.startSession(scenarioId)
      onStart(session.id)
    } finally {
      setStarting(false)
    }
  }

  if (scenarios === null || hasKey === null) return <p>Loading…</p>

  return (
    <div className="deck-list">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to decks
        </button>
      </div>

      <h2>AI Tutor</h2>
      {hasKey === false && (
        <p className="deck-description">
          You need to add an Anthropic API key in Settings before starting a tutoring session.
        </p>
      )}

      <ul className="deck-cards">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="deck-card">
            <div className="deck-card-info">
              <h3>{scenario.name}</h3>
              <p className="deck-description">{scenario.description}</p>
            </div>
            <div className="deck-card-actions">
              <button
                className="btn btn-primary"
                disabled={!hasKey || starting}
                onClick={() => handleStart(scenario.id)}
              >
                Start
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
