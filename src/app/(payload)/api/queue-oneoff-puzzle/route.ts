import payload from 'payload'
import config from '@/payload.config'
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'
import { filterValidOneOffs } from '@/utils/filterValidOneOffs'

const MW_API_KEY = process.env.MW_API_KEY as string
const MAX_ATTEMPTS = 25

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    const reason = !secret ? 'Missing ?secret parameter' : 'Invalid ?secret value'

    console.warn('❌ Unauthorized cron attempt', {
      provided: secret,
      expectedLength: process.env.CRON_SECRET?.length,
      timestamp: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        reason,
        hint: 'Ensure vercel.json uses ?secret=@cron_secret and CRON_SECRET is set in env',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    )
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
      const checkValid = await filterValidOneOffs(candidates)

      if (checkValid.length >= 6 && checkValid.length <= 20) {
        valid = checkValid
        break
      }
    }

    if (valid.length < 6 || valid.length > 20) {
      console.warn('⚠️ Puzzle generation failed', {
        attempts,
        lastTriedWord: startingWord,
        validCount: valid.length,
        timestamp: new Date().toISOString(),
      })

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
