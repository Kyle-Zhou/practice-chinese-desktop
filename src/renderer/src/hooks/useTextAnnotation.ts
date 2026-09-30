import { useEffect, useState } from 'react'
import type { TextAnnotation } from '@shared/types'

/**
 * Pinyin and English are fetched independently rather than as one combined result: pinyin is a
 * local dictionary lookup (near-instant), while English is a real translation call to the tutor
 * model (a few hundred ms). Bundling them would mean the slow one holds up the fast one — pinyin
 * used to appear instantly and should keep doing so regardless of how long translation takes.
 * Both are debounced against `text`, which changes on every streamed chunk.
 */
export function useTextAnnotation(text: string, showPinyin: boolean, showEnglish: boolean): TextAnnotation {
  const [pinyin, setPinyin] = useState('')
  const [english, setEnglish] = useState('')

  useEffect(() => {
    if (!showPinyin || !text.trim()) {
      setPinyin('')
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.dictionary.pinyin(text).then((result) => {
        if (!cancelled) setPinyin(result)
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, showPinyin])

  useEffect(() => {
    if (!showEnglish || !text.trim()) {
      setEnglish('')
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api.dictionary.translate(text).then((result) => {
        if (!cancelled) setEnglish(result)
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, showEnglish])

  return { pinyin, english }
}
