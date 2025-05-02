import type { PayloadHandler } from 'payload'
import { generateOneOffCandidates } from '../utils/generateOneOffCandidates'
import { filterValidOneOffs } from '../utils/filterValidOneOffs'

export const generateOneoffsHandler: PayloadHandler = async (req) => {
  if (!req.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    if (typeof req.json !== 'function') {
      return new Response(JSON.stringify({ error: 'Invalid request context' }), { status: 500 })
    }

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Expected JSON' }), { status: 415 })
    }

    const body = await req.json()
    const { startingWord } = body

    if (!startingWord || typeof startingWord !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid startingWord' }), {
        status: 400,
      })
    }

    const sanitized = startingWord.replace(/[^a-z]/gi, '')
    const candidates = generateOneOffCandidates(sanitized)
    const valid = await filterValidOneOffs(candidates)

    return new Response(JSON.stringify({ words: valid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('❌ Merriam-Webster filter failed:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
  }
}
