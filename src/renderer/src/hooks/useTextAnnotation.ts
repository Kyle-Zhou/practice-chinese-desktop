import { useEffect, useState } from 'react'
import type { TextAnnotation } from '@shared/types'

const EMPTY: TextAnnotation = { pinyin: '', english: '' }

/**
 * Debounced pinyin/English lookup for a piece of tutor speech. The text changes on every
 * streamed chunk, so this waits for a short pause before hitting the dictionary rather than
 * re-annotating on every character.
 */
export function useTextAnnotation(text: string, enabled: boolean): TextAnnotation {
  const [result, setResult] = useState<TextAnnotation>(EMPTY)

  useEffect(() => {
    if (!enabled || !text.trim()) {
      setResult(EMPTY)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.dictionary.annotate(text).then((annotation) => {
        if (!cancelled) setResult(annotation)
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, enabled])

  return result
}
