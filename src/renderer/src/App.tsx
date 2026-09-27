import { useState } from 'react'
import { useTheme } from './hooks/useTheme'
import ErrorBoundary from './components/ErrorBoundary'
import Home from './components/Home'
import DeckList from './components/DeckList'
import StudySession from './components/StudySession'
import DeckManager from './components/DeckManager'
import LessonPath from './components/LessonPath'
import LessonView from './components/LessonView'
import Settings from './components/Settings'
import StreakBadge from './components/StreakBadge'
import TutorScenarioPicker from './components/TutorScenarioPicker'
import TutorChat from './components/TutorChat'
import TutorSummaryView from './components/TutorSummaryView'
import navIconLearn from './assets/nav-icon-learn.png'
import navIconDecks from './assets/nav-icon-decks.png'
import navIconTutor from './assets/nav-icon-tutor.png'

type View =
  | { name: 'home' }
  | { name: 'decks' }
  | { name: 'study'; deckId: number | null }
  | { name: 'manage'; deckId: number }
  | { name: 'lessons' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'settings' }
  | { name: 'tutorPicker' }
  | { name: 'tutorChat'; sessionId: number }
  | { name: 'tutorSummary'; sessionId: number }

/** Top-level section a view belongs to, so drill-down views keep their sidebar item highlighted. */
type Section = 'home' | 'lessons' | 'decks' | 'tutor' | 'settings'

function sectionForView(name: View['name']): Section {
  if (name === 'lessons' || name === 'lesson') return 'lessons'
  if (name === 'decks' || name === 'study' || name === 'manage') return 'decks'
  if (name === 'tutorPicker' || name === 'tutorChat' || name === 'tutorSummary') return 'tutor'
  if (name === 'settings') return 'settings'
  return 'home'
}

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ name: 'home' })
  const section = sectionForView(view.name)
  const { theme, setTheme } = useTheme()

  const navItemClass = (target: Section): string =>
    `btn app-nav-item ${section === target ? 'btn-toggle-on' : ''}`

  return (
    <div className="app">
      <div className="app-shell">
        <aside className="app-sidebar">
          <h1 className="app-logo" onClick={() => setView({ name: 'home' })}>
            汉语 Practice
          </h1>
          <nav className="app-nav-rail">
            <button className={navItemClass('home')} onClick={() => setView({ name: 'home' })}>
              Home
            </button>
            <button className={navItemClass('lessons')} onClick={() => setView({ name: 'lessons' })}>
              <img className="app-nav-icon" src={navIconLearn} height={26} alt="" />
              Learn
            </button>
            <button className={navItemClass('decks')} onClick={() => setView({ name: 'decks' })}>
              <img className="app-nav-icon" src={navIconDecks} height={26} alt="" />
              Decks
            </button>
            <button className={navItemClass('tutor')} onClick={() => setView({ name: 'tutorPicker' })}>
              <img className="app-nav-icon" src={navIconTutor} height={26} alt="" />
              AI Tutor
            </button>
          </nav>
          <button
            className={`${navItemClass('settings')} app-nav-bottom`}
            onClick={() => setView({ name: 'settings' })}
          >
            <svg
              className="app-nav-icon"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </aside>

        <main className={`app-main ${view.name === 'tutorChat' ? 'app-main-wide' : ''}`}>
          <ErrorBoundary onReset={() => setView({ name: 'home' })}>
            {view.name === 'home' && (
              <Home
                onStudyAll={() => setView({ name: 'study', deckId: null })}
                onOpenLesson={(lessonId) => setView({ name: 'lesson', lessonId })}
                onGoLearn={() => setView({ name: 'lessons' })}
                onOpenTutor={() => setView({ name: 'tutorPicker' })}
                onResumeTutor={(sessionId) => setView({ name: 'tutorChat', sessionId })}
              />
            )}
            {view.name === 'decks' && (
              <DeckList
                onStudy={(deckId) => setView({ name: 'study', deckId })}
                onManage={(deckId) => setView({ name: 'manage', deckId })}
              />
            )}
            {view.name === 'study' && <StudySession deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />}
            {view.name === 'manage' && (
              <DeckManager deckId={view.deckId} onExit={() => setView({ name: 'decks' })} />
            )}
            {view.name === 'lessons' && (
              <LessonPath onOpenLesson={(lessonId) => setView({ name: 'lesson', lessonId })} />
            )}
            {view.name === 'lesson' && (
              <LessonView
                lessonId={view.lessonId}
                onExit={() => setView({ name: 'lessons' })}
                onStudy={(deckId) => setView({ name: 'study', deckId })}
              />
            )}
            {view.name === 'settings' && (
              <Settings onExit={() => setView({ name: 'decks' })} theme={theme} onThemeChange={setTheme} />
            )}
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
          </ErrorBoundary>
        </main>

        {section !== 'settings' && (
          <aside className="app-right">
            <StreakBadge refreshOn={JSON.stringify(view)} />
          </aside>
        )}
      </div>
    </div>
  )
}
