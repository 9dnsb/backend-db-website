import payload from 'payload'
import config from '@/payload.config'
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string

export async function GET() {
  if (!MW_API_KEY) {
    console.error('❌ Missing Merriam-Webster API key (MW_API_KEY)')
    return new Response('Missing MW_API_KEY', { status: 500 })
  }

  if (!payload.config) {
    await payload.init({ config })
  }

  const englishWordSet = new Set(englishWords)

  let startingWord = ''
  let valid: string[] = []

  // Try until we find a good puzzle
  while (true) {
    const rawWord = englishWords[Math.floor(Math.random() * englishWords.length)]
    startingWord = rawWord.toLowerCase().replace(/[^a-z]/g, '')

    if (startingWord.length < 3) continue

    const candidates = generateOneOffCandidates(startingWord)
    const filtered = candidates.filter((w) => englishWordSet.has(w))

    const checkValid: string[] = []

    for (const word of filtered) {
      const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`
      const res = await fetch(url)
      const data = await res.json()
      if (
        Array.isArray(data) &&
        typeof data[0] === 'object' &&
        'shortdef' in data[0] &&
        Array.isArray(data[0].shortdef) &&
        data[0].shortdef.length > 0
      ) {
        checkValid.push(word)
      }
    }

    if (checkValid.length >= 6 && checkValid.length <= 20) {
      valid = checkValid
      break
    }
  }

  // Final sanity check
  if (valid.length < 6 || valid.length > 20) {
    console.error(`❌ Refusing to create puzzle with ${valid.length} answers`)
    return new Response('Invalid puzzle. Not created.', { status: 400 })
  }

  const publishDate = new Date().toISOString()

  await payload.create({
    collection: 'oneoffpuzzles',
    data: {
      slug: publishDate.slice(0, 10),
      startingWord,
      validAnswers: valid.map((word) => ({ word })),
      publishedDate: publishDate,
    },
  })

  console.log(`✅ Created OneOff Puzzle for '${startingWord}' with ${valid.length} answers`)
  return new Response('✅ Created OneOff Puzzle', { status: 200 })
}
