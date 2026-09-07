import { useEffect, useRef, useState } from 'react'
import type { DictionaryEntry } from '@shared/types'

interface Props {
  onPick: (entry: DictionaryEntry) => void
  placeholder?: string
}

const RESULT_LIMIT = 8
const DEBOUNCE_MS = 140

/**
 * One box for three kinds of lookup: type hanzi, pinyin (with or without tones), or English and
 * the bundled CC-CEDICT answers offline. Picking a result hands the whole entry to the caller,
 * which is what turns "I only know the English" into a filled-in card.
 */
export default function DictionarySearch({ onPick, placeholder }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DictionaryEntry[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(true)
  const requestRef = useRef(0)

  useEffect(() => {
    window.api.dictionary.ready().then(setReady)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    const request = ++requestRef.current
    const timer = setTimeout(async () => {
      if (!ready) setReady(await window.api.dictionary.ready())
      const entries = await window.api.dictionary.search(trimmed, RESULT_LIMIT)
      // Keystrokes can resolve out of order; only the newest search may paint.
      if (request !== requestRef.current) return
      setResults(entries)
      setHighlighted(0)
      setOpen(true)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, ready])

  function choose(entry: DictionaryEntry): void {
    onPick(entry)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div className="dict-search">
      <input
        className="dict-search-input"
        value={query}
        placeholder={placeholder ?? 'Search the dictionary — 你好, ni hao, or hello'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {showDropdown && (
        <ul className="dict-results">
          {results.map((entry, index) => (
            <li key={entry.id}>
              {/* mousedown, not click: the input's blur would close the list first. */}
              <button
                type="button"
                className={`dict-result ${index === highlighted ? 'dict-result-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(entry)
                }}
                onMouseEnter={() => setHighlighted(index)}
              >
                <span className="dict-result-hanzi">{entry.simplified}</span>
                <span className="dict-result-pinyin">{entry.pinyin}</span>
                <span className="dict-result-english">{entry.english}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="dict-empty">{ready ? 'No matches' : 'Building the dictionary — try again in a moment…'}</li>
          )}
        </ul>
      )}
    </div>
  )
}
