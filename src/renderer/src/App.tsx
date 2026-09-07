import { useState } from 'react'
import DeckList from './components/DeckList'
import StudySession from './components/StudySession'
import DeckManager from './components/DeckManager'
import LessonPath from './components/LessonPath'
import LessonView from './components/LessonView'
import Settings from './components/Settings'
import TutorScenarioPicker from './components/TutorScenarioPicker'
import TutorChat from './components/TutorChat'
import TutorSummaryView from './components/TutorSummaryView'

type View =
  | { name: 'decks' }
  | { name: 'study'; deckId: number | null }
  | { name: 'manage'; deckId: number }
  | { name: 'lessons' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'settings' }
  | { name: 'tutorPicker' }
  | { name: 'tutorChat'; sessionId: number }
  | { name: 'tutorSummary'; sessionId: number }

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ name: 'decks' })

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setView({ name: 'decks' })}>汉语 Chinese Anki</h1>
        <nav className="app-nav">
          <button className="btn" onClick={() => setView({ name: 'lessons' })}>
            Learn
          </button>
          <button className="btn" onClick={() => setView({ name: 'tutorPicker' })}>
            AI Tutor
          </button>
          <button className="btn" onClick={() => setView({ name: 'settings' })}>
            Settings
          </button>
        </nav>
      </header>
      <main className={`app-main ${view.name === 'tutorChat' ? 'app-main-wide' : ''}`}>
        {view.name === 'decks' && (
          <DeckList
            onStudy={(deckId) => setView({ name: 'study', deckId })}
            onManage={(deckId) => setView({ name: 'manage', deckId })}
            onLearn={() => setView({ name: 'lessons' })}
          />
        )}
        {view.name === 'study' && <StudySession deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />}
        {view.name === 'manage' && <DeckManager deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />}
        {view.name === 'lessons' && (
          <LessonPath
            onOpenLesson={(lessonId) => setView({ name: 'lesson', lessonId })}
            onExit={() => setView({ name: 'decks' })}
          />
        )}
        {view.name === 'lesson' && (
          <LessonView
            lessonId={view.lessonId}
            onExit={() => setView({ name: 'lessons' })}
            onStudy={(deckId) => setView({ name: 'study', deckId })}
          />
        )}
        {view.name === 'settings' && <Settings onExit={() => setView({ name: 'decks' })} />}
        {view.name === 'tutorPicker' && (
          <TutorScenarioPicker
            onExit={() => setView({ name: 'decks' })}
            onOpenSession={(sessionId) => setView({ name: 'tutorChat', sessionId })}
            onViewSummary={(sessionId) => setView({ name: 'tutorSummary', sessionId })}
            onOpenSettings={() => setView({ name: 'settings' })}
          />
        )}
        {view.name === 'tutorChat' && (
          <TutorChat
            sessionId={view.sessionId}
            onExit={() => setView({ name: 'tutorPicker' })}
            onComplete={(sessionId) => setView({ name: 'tutorSummary', sessionId })}
          />
        )}
        {view.name === 'tutorSummary' && (
          <TutorSummaryView sessionId={view.sessionId} onExit={() => setView({ name: 'tutorPicker' })} />
        )}
      </main>
    </div>
  )
}
