export function generateOneOffCandidates(word: string): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const result = new Set<string>()

  // Change one letter
  for (let i = 0; i < word.length; i++) {
    for (const char of alphabet) {
      if (char !== word[i]) {
        result.add(word.slice(0, i) + char + word.slice(i + 1))
      }
    }
  }

  // Add one letter
  for (let i = 0; i <= word.length; i++) {
    for (const char of alphabet) {
      result.add(word.slice(0, i) + char + word.slice(i))
    }
  }

  // Remove one letter
  for (let i = 0; i < word.length; i++) {
    result.add(word.slice(0, i) + word.slice(i + 1))
  }

  return [...result].filter((w) => w !== word && w.length >= 3)
}
