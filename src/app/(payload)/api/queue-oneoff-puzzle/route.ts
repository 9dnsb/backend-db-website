import payload from 'payload'
import config from '@/payload.config' // ✅ Correct real import
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string

export async function GET() {
  if (!payload.config) {
    await payload.init({
      config, // ✅ Pass real imported config
    })
  }

  const startingWord = englishWords[Math.floor(Math.random() * englishWords.length)]
  const candidates = generateOneOffCandidates(startingWord)

  const englishWordSet = new Set(englishWords)
  const filtered = candidates.filter((w) => englishWordSet.has(w))

  const valid: string[] = []

  for (const word of filtered) {
    const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`
    const res = await fetch(url)
    const data = await res.json()
    if (Array.isArray(data) && typeof data[0] === 'object') {
      valid.push(word)
    }
  }

  if (valid.length === 0) {
    console.warn(`⚠️ No valid one-offs found for starting word: ${startingWord}`)
    return new Response('⚠️ No valid one-offs', { status: 200 })
  }

  await payload.create({
    collection: 'oneoffpuzzles',
    data: {
      slug: new Date().toISOString().slice(0, 10),
      startingWord,
      validAnswers: valid.map((word) => ({ word })),
      publishedDate: new Date().toISOString(),
    },
  })

  console.log(`✅ Created OneOff Puzzle for '${startingWord}' with ${valid.length} answers`)
  return new Response('✅ Created OneOff Puzzle', { status: 200 })
}
