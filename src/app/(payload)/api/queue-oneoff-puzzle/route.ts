import payload from 'payload'
import config from '@/payload.config'
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string
const CRON_SECRET = process.env.CRON_SECRET as string
const MAX_ATTEMPTS = 25

const englishWordSet = new Set(englishWords)

async function fetchWithTimeout<T = unknown>(url: string, ms = 5000): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(req: Request) {
  // ✅ Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  if (token !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  try {
    if (!MW_API_KEY) {
      console.error('❌ Missing Merriam-Webster API key')
      return new Response(JSON.stringify({ error: 'Missing MW_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    if (!payload.config) {
      await payload.init({ config })
    }

    const slug = new Date().toISOString().slice(0, 10)

    const existing = await payload.find({
      collection: 'oneoffpuzzles',
      where: { slug: { equals: slug } },
    })

    if (existing.totalDocs > 0) {
      return Response.json(
        { message: `Puzzle already exists for ${slug}` },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    let startingWord = ''
    let valid: string[] = []
    let attempts = 0

    while (attempts < MAX_ATTEMPTS) {
      attempts++
      const rawWord = englishWords[Math.floor(Math.random() * englishWords.length)]
      startingWord = rawWord.toLowerCase().replace(/[^a-z]/g, '')
      if (startingWord.length < 3) continue

      const candidates = generateOneOffCandidates(startingWord)
      const filtered = candidates.filter((w) => englishWordSet.has(w))

      const checkValid: string[] = []

      for (const word of filtered) {
        try {
          const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`
          const data = await fetchWithTimeout(url)
          if (
            Array.isArray(data) &&
            typeof data[0] === 'object' &&
            'shortdef' in data[0] &&
            Array.isArray(data[0].shortdef) &&
            data[0].shortdef.length > 0
          ) {
            checkValid.push(word)
          }
        } catch (_err) {
          console.warn(`⚠️ Skipped word "${word}" due to fetch error or timeout.`)
        }
      }

      if (checkValid.length >= 6 && checkValid.length <= 20) {
        valid = checkValid
        break
      }
    }

    if (valid.length < 6 || valid.length > 20) {
      return new Response(JSON.stringify({ error: 'Invalid puzzle. Not created.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    const publishDate = new Date().toISOString()

    await payload.create({
      collection: 'oneoffpuzzles',
      data: {
        slug,
        startingWord,
        validAnswers: valid.map((word) => ({ word })),
        publishedDate: publishDate,
      },
    })

    console.log(
      JSON.stringify({
        status: 'success',
        slug,
        startingWord,
        validCount: valid.length,
        timestamp: publishDate,
      }),
    )

    return Response.json(
      { message: '✅ Created OneOff Puzzle', slug, startingWord, validCount: valid.length },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('❌ Unexpected error in cron job:', err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}
