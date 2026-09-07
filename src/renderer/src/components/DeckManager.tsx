import { useEffect, useState } from 'react'
import DictionarySearch from './DictionarySearch'
import { shortGloss } from '@shared/text'
import type { Card, Deck } from '@shared/types'

interface Props {
  deckId: number
  onExit: () => void
}

const emptyForm = { hanzi: '', pinyin: '', english: '', audioPath: '', notes: '' }

export default function DeckManager({ deckId, onExit }: Props): React.JSX.Element {
  const [cards, setCards] = useState<Card[]>([])
  const [deck, setDeck] = useState<Deck | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)

  async function refresh(): Promise<void> {
    const [deckCards, decks] = await Promise.all([window.api.cards.listForDeck(deckId), window.api.decks.list()])
    setCards(deckCards)
    setDeck(decks.find((d) => d.id === deckId) ?? null)
  }

  useEffect(() => {
    refresh()
  }, [deckId])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const hanzi = form.hanzi.trim()
    const pinyin = form.pinyin.trim()
    const english = form.english.trim()
    if (!hanzi || !pinyin || !english) return

    const fields = {
      hanzi,
      pinyin,
      english,
      audioPath: form.audioPath.trim() || null,
      notes: form.notes.trim() || null
    }

    if (editingId !== null) {
      await window.api.cards.update(editingId, fields)
    } else {
      await window.api.cards.add({ deckId, ...fields })
    }
    setForm(emptyForm)
    setEditingId(null)
    await refresh()
  }

  function startEdit(card: Card): void {
    setEditingId(card.id)
    setForm({
      hanzi: card.hanzi,
      pinyin: card.pinyin,
      english: card.english,
      audioPath: card.audioPath ?? '',
      notes: card.notes ?? ''
    })
  }

  function cancelEdit(): void {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleDelete(id: number): Promise<void> {
    if (!confirm('Delete this card?')) return
    await window.api.cards.delete(id)
    if (editingId === id) cancelEdit()
    await refresh()
  }

  return (
    <div className="deck-manager">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to decks
        </button>
        <span>
          {deck ? `${deck.name} · ` : ''}
          {cards.length} cards
        </span>
      </div>

      <form className="card-form" onSubmit={handleSubmit}>
        <h3>{editingId !== null ? 'Edit card' : 'Add card'}</h3>
        <DictionarySearch
          onPick={(entry) =>
            setForm((current) => ({
              ...current,
              hanzi: entry.simplified,
              pinyin: entry.pinyin,
              english: shortGloss(entry.english, 3)
            }))
          }
        />
        <p className="card-form-hint">
          Search by hanzi, pinyin, or English to fill the fields below — everything stays editable.
        </p>
        <div className="card-form-grid">
          <input
            placeholder="Hanzi (e.g. 你好)"
            value={form.hanzi}
            onChange={(e) => setForm({ ...form, hanzi: e.target.value })}
          />
          <input
            placeholder="Pinyin (e.g. nǐ hǎo)"
            value={form.pinyin}
            onChange={(e) => setForm({ ...form, pinyin: e.target.value })}
          />
          <input
            placeholder="English"
            value={form.english}
            onChange={(e) => setForm({ ...form, english: e.target.value })}
          />
          <input
            placeholder="Audio file path (optional)"
            value={form.audioPath}
            onChange={(e) => setForm({ ...form, audioPath: e.target.value })}
          />
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="card-form-actions">
          <button className="btn btn-primary" type="submit">
            {editingId !== null ? 'Save changes' : 'Add card'}
          </button>
          {editingId !== null && (
            <button className="btn" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <table className="card-table">
        <thead>
          <tr>
            <th>Hanzi</th>
            <th>Pinyin</th>
            <th>English</th>
            <th>Due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id}>
              <td className="hanzi-cell">{card.hanzi}</td>
              <td>{card.pinyin}</td>
              <td>{card.english}</td>
              <td>{new Date(card.dueAt).toLocaleDateString()}</td>
              <td className="card-row-actions">
                <button className="btn btn-small" onClick={() => startEdit(card)}>
                  Edit
                </button>
                <button className="btn btn-small btn-danger" onClick={() => handleDelete(card.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
