import { useEffect, useState } from 'react'
import type { TutorSessionSummaryRow } from '@shared/types'

interface Props {
  onExit: () => void
  onViewSummary: (sessionId: number) => void
}

export default function TutorHistory({ onExit, onViewSummary }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<TutorSessionSummaryRow[] | null>(null)

  async function refresh(): Promise<void> {
    const sessionList = await window.api.tutor.listSessions()
    setSessions(sessionList.filter((s) => s.status === 'completed'))
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleDelete(sessionId: number): Promise<void> {
    if (!confirm('Delete this session and its history?')) return
    await window.api.tutor.deleteSession(sessionId)
    await refresh()
  }

  return (
    <div className="deck-list">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to AI Tutor
        </button>
      </div>

      <h2>Past sessions</h2>

      {sessions === null ? (
        <p>Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="deck-description">No completed sessions yet.</p>
      ) : (
        <table className="card-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Progress</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.scenarioName}</td>
                <td>{s.progressPercent}%</td>
                <td>{new Date(s.updatedAt).toLocaleDateString()}</td>
                <td className="card-row-actions">
                  <button className="btn btn-small" onClick={() => onViewSummary(s.id)}>
                    Summary
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(s.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
