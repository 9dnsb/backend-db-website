import type { Payload } from 'payload'
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string

const createOneOffPuzzle = async ({ payload }: { payload: Payload }) => {
  try {
    const startingWord = englishWords[Math.floor(Math.random() * englishWords.length)]

    console.log(`🎲 Picked starting word: ${startingWord}`)

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
      return 'success'
    }

    const publishDate = new Date().toISOString()

    await payload.create({
      collection: 'oneoffpuzzles',
      data: {
        publishedDate: publishDate,
        slug: publishDate.slice(0, 10),
        startingWord,
        validAnswers: valid.map((word) => ({ word })),
      },
    })

    console.log(`✅ Created OneOff Puzzle for '${startingWord}' with ${valid.length} answers`)
    return 'success'
  } catch (err) {
    console.error('❌ Failed to create OneOff puzzle:', err)
    return 'error'
  }
}

export default createOneOffPuzzle
