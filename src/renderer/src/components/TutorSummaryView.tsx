import type { TutorSummary } from '@shared/types'

interface Props {
  summary: TutorSummary
  scenarioName: string
  onExit: () => void
}

export default function TutorSummaryView({ summary, scenarioName, onExit }: Props): React.JSX.Element {
  return (
    <div className="tutor-summary">
      <h2>Session Complete: {scenarioName}</h2>

      <div className="settings-card">
        <h3>Key Mistakes</h3>
        {summary.keyMistakes.length === 0 ? (
          <p className="deck-description">No recurring mistake patterns — nice work!</p>
        ) : (
          <ul>
            {summary.keyMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="settings-card">
        <h3>Learnings</h3>
        <ul>
          {summary.learnings.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="settings-card">
        <h3>Vocabulary</h3>
        <p className="deck-description">
          {summary.vocabAddedCount > 0
            ? `${summary.vocabAddedCount} new word${summary.vocabAddedCount === 1 ? '' : 's'} added to your "Tutor Vocabulary" deck.`
            : 'No new vocabulary was added this session.'}
        </p>
      </div>

      <button className="btn btn-primary" onClick={onExit}>
        Back to decks
      </button>
    </div>
  )
}
