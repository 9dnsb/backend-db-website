import type { PayloadHandler } from 'payload'
import { generateOneOffCandidates } from '../utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string

export const generateOneoffsHandler: PayloadHandler = async (req) => {
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
    const englishWordSet = new Set(englishWords)
    const candidates = generateOneOffCandidates(startingWord)
    const filtered = candidates.filter((word) => englishWordSet.has(word))

    const valid: string[] = []

    for (const word of filtered) {
      const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`

      const res = await fetch(url)
      const data = await res.json()

      if (Array.isArray(data) && typeof data[0] === 'object') {
        valid.push(word)
      }
    }

    return new Response(JSON.stringify({ words: valid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('❌ Merriam-Webster filter failed:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
  }
}
