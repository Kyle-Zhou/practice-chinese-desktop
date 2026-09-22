import { useEffect, useState } from 'react'
import type { StreakInfo } from '@shared/types'

interface Props {
  /** Bump this to refetch — the badge stays mounted across tabs, so its parent triggers refreshes on navigation. */
  refreshOn: string
}

export default function StreakBadge({ refreshOn }: Props): React.JSX.Element | null {
  const [streak, setStreak] = useState<StreakInfo | null>(null)

  useEffect(() => {
    window.api.progress.streak().then(setStreak)
  }, [refreshOn])

  if (!streak) return null

  return (
    <div className={`streak-badge ${streak.activeToday ? 'streak-badge-active' : ''}`}>
      <svg
        className="streak-badge-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2c1 3-2 4.5-2 7.5a3 3 0 0 0 6 0c1.5 1.5 2 3.5 2 5.5a6 6 0 0 1-12 0c0-4 2.5-6 3-9.5C9.3 4 10.5 3 12 2z" />
      </svg>
      <span className="streak-badge-count">{streak.current}</span>
    </div>
  )
}
