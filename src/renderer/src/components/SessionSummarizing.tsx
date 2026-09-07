interface Props {
  themeName: string
  progress: number
  correctionCount: number
  vocabCount: number
}

/**
 * Shown while `endSession` runs. Writing the summary is a Sonnet call over the whole
 * transcript, so it takes a few seconds — long enough that leaving the conversation on screen
 * with a disabled button reads as a freeze. The counts are already known locally, so the wait
 * shows what was actually accomplished rather than a bare spinner.
 */
export default function SessionSummarizing({
  themeName,
  progress,
  correctionCount,
  vocabCount
}: Props): React.JSX.Element {
  return (
    <div className="session-ending">
      <div className="session-ending-orb" />
      <div className="session-ending-text">
        <h2>Wrapping up {themeName}</h2>
        <p>Reading back through the conversation for your mistakes, learnings, and new words.</p>
      </div>
      <ul className="session-ending-stats">
        <li>
          <strong>{progress}%</strong> covered
        </li>
        <li>
          <strong>{correctionCount}</strong> correction{correctionCount === 1 ? '' : 's'}
        </li>
        <li>
          <strong>{vocabCount}</strong> new card{vocabCount === 1 ? '' : 's'}
        </li>
      </ul>
    </div>
  )
}
