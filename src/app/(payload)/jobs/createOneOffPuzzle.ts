import type { Payload } from 'payload'
import { generateOneOffCandidates } from '@/utils/generateOneOffCandidates'
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string

const createOneOffPuzzle = async ({ payload }: { payload: Payload }) => {
  try {
    console.log('🎲 Starting to pick a valid starting word...')

    const englishWordSet = new Set(englishWords)

    let startingWord = ''
    let valid: string[] = []

    // Keep trying until we find a word with 6-20 valid one-offs
    while (true) {
      startingWord = englishWords[Math.floor(Math.random() * englishWords.length)]
      console.log(`🎲 Trying starting word: ${startingWord}`)

      const candidates = generateOneOffCandidates(startingWord)
      const filtered = candidates.filter((w) => englishWordSet.has(w))

      const checkValid: string[] = []

      for (const word of filtered) {
        const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`
        const res = await fetch(url)
        const data = await res.json()
        if (Array.isArray(data) && typeof data[0] === 'object') {
          checkValid.push(word)
        }
      }

      if (checkValid.length >= 6 && checkValid.length <= 20) {
        console.log(
          `✅ Found valid starting word '${startingWord}' with ${checkValid.length} valid one-offs`,
        )
        valid = checkValid
        break
      } else {
        console.warn(
          `⚠️ Word '${startingWord}' had ${checkValid.length} valid one-offs — trying another...`,
        )
      }
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
