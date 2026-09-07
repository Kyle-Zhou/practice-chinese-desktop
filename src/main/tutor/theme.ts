import type Anthropic from '@anthropic-ai/sdk'
import { DESIGN_MODEL, anthropicClient, toolInput } from './client'
import { createCustomScenario } from '../db'
import type { PlanCheckpoint, Scenario } from '../../shared/types'

const THEME_TOOL: Anthropic.Tool = {
  name: 'define_lesson',
  description: 'Define a free-conversation Mandarin lesson from a learner-supplied theme.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short lesson title in English (2-5 words)' },
      description: {
        type: 'string',
        description: 'One English sentence: what the conversation is about and what the learner will practice'
      },
      goals: {
        type: 'array',
        description: '4-6 concrete, unordered conversational goals the learner should accomplish in Chinese',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'snake_case identifier' },
            description: { type: 'string', description: 'English description of what the learner should do or express' },
            keyPhrases: {
              type: 'array',
              description: '2-3 Chinese words or phrases (simplified) useful for this goal',
              items: { type: 'string' }
            }
          },
          required: ['id', 'description', 'keyPhrases'],
          additionalProperties: false
        }
      }
    },
    required: ['name', 'description', 'goals'],
    additionalProperties: false
  }
}

interface ThemeDesign {
  name: string
  description: string
  goals: PlanCheckpoint[]
}

/** Turns a free-text theme ("talk about my trip to Japan", "practice 把 sentences") into a lesson scenario. */
export async function createTheme(prompt: string): Promise<Scenario> {
  const response = await anthropicClient().messages.create({
    model: DESIGN_MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system:
      'You design short spoken Mandarin conversation lessons for an intermediate learner (HSK 2-3). Goals must be things the learner *does* in conversation (describe, compare, ask, narrate), not grammar labels. Use the define_lesson tool.',
    messages: [{ role: 'user', content: `Theme requested by the learner: ${prompt}` }],
    tools: [THEME_TOOL],
    tool_choice: { type: 'tool', name: 'define_lesson' }
  })
  const design = toolInput<ThemeDesign>(response)
  if (!design) throw new Error('Could not design a lesson from that theme. Try rephrasing it.')

  return createCustomScenario({
    kind: 'conversation',
    name: design.name.trim(),
    description: design.description.trim(),
    tutorRole: 'a friendly Mandarin tutor',
    plan: design.goals.map((g) => ({ ...g, id: g.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase() }))
  })
}
