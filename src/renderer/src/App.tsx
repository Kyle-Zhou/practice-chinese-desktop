import { useState } from 'react'
import DeckList from './components/DeckList'
import StudySession from './components/StudySession'
import DeckManager from './components/DeckManager'
import Settings from './components/Settings'
import TutorScenarioPicker from './components/TutorScenarioPicker'
import TutorChat from './components/TutorChat'
import TutorSummaryView from './components/TutorSummaryView'
import type { TutorSummary } from '@shared/types'

type View =
  | { name: 'decks' }
  | { name: 'study'; deckId: number | null }
  | { name: 'manage'; deckId: number }
  | { name: 'settings' }
  | { name: 'tutorPicker' }
  | { name: 'tutorChat'; sessionId: number }
  | { name: 'tutorSummary'; summary: TutorSummary; scenarioName: string }

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ name: 'decks' })

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setView({ name: 'decks' })}>汉语 Chinese Anki</h1>
        <nav className="app-nav">
          <button className="btn" onClick={() => setView({ name: 'tutorPicker' })}>
            AI Tutor
          </button>
          <button className="btn" onClick={() => setView({ name: 'settings' })}>
            Settings
          </button>
        </nav>
      </header>
      <main className="app-main">
        {view.name === 'decks' && (
          <DeckList
            onStudy={(deckId) => setView({ name: 'study', deckId })}
            onManage={(deckId) => setView({ name: 'manage', deckId })}
          />
        )}
        {view.name === 'study' && (
          <StudySession deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />
        )}
        {view.name === 'manage' && (
          <DeckManager deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />
        )}
        {view.name === 'settings' && <Settings onExit={() => setView({ name: 'decks' })} />}
        {view.name === 'tutorPicker' && (
          <TutorScenarioPicker
            onExit={() => setView({ name: 'decks' })}
            onStart={(sessionId) => setView({ name: 'tutorChat', sessionId })}
          />
        )}
        {view.name === 'tutorChat' && (
          <TutorChat
            sessionId={view.sessionId}
            onExit={() => setView({ name: 'decks' })}
            onComplete={(summary, scenarioName) => setView({ name: 'tutorSummary', summary, scenarioName })}
          />
        )}
        {view.name === 'tutorSummary' && (
          <TutorSummaryView
            summary={view.summary}
            scenarioName={view.scenarioName}
            onExit={() => setView({ name: 'decks' })}
          />
        )}
      </main>
    </div>
  )
}
