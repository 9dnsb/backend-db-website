// src/utils/filterValidOneOffs.ts
import englishWords from 'an-array-of-english-words'

const MW_API_KEY = process.env.MW_API_KEY as string
const englishWordSet = new Set(englishWords)
if (!MW_API_KEY) {
  throw new Error('Missing Merriam-Webster API key in environment variables')
}

export async function filterValidOneOffs(
  candidates: string[],
  timeoutMs = 5000,
): Promise<string[]> {
  const results: string[] = []

  for (const word of candidates) {
    if (!englishWordSet.has(word)) continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_API_KEY}`
      const res = await fetch(url, { signal: controller.signal })
      const data = await res.json()
      clearTimeout(timeout)

      if (
        Array.isArray(data) &&
        typeof data[0] === 'object' &&
        'shortdef' in data[0] &&
        Array.isArray(data[0].shortdef) &&
        data[0].shortdef.length > 0
      ) {
        results.push(word)
      }
    } catch {
      // Silent fail on timeout or abort
    }
  }

  return results
}
