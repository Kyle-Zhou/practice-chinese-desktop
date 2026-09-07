/**
 * Incremental sentence splitter for streaming text-to-speech. Feed it text deltas;
 * it returns complete sentences as soon as a terminator arrives so the renderer can
 * start speaking before the model finishes the whole reply.
 */
const TERMINATORS = /[。！？!?；;\n]/

export class SentenceSplitter {
  private buffer = ''

  push(delta: string): string[] {
    this.buffer += delta
    const out: string[] = []
    let match: RegExpExecArray | null
    while ((match = TERMINATORS.exec(this.buffer)) !== null) {
      const end = match.index + 1
      // Also swallow closing quotes/brackets that follow the terminator.
      let cut = end
      while (cut < this.buffer.length && /["”’）)\]】」』]/.test(this.buffer[cut])) cut++
      const sentence = this.buffer.slice(0, cut).trim()
      this.buffer = this.buffer.slice(cut)
      if (sentence) out.push(sentence)
    }
    return out
  }

  /** Returns whatever is left (a trailing sentence with no terminator) and resets. */
  flush(): string | null {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest || null
  }
}

export function splitSentences(text: string): string[] {
  const splitter = new SentenceSplitter()
  const out = splitter.push(text)
  const rest = splitter.flush()
  if (rest) out.push(rest)
  return out
}

/** Strips pinyin/English asides in parentheses so speech synthesis only reads the Chinese. */
export function speakableText(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, '').trim()
}
