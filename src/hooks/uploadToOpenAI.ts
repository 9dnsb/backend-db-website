import type { CollectionAfterChangeHook } from 'payload'
import { getPayload } from 'payload'
import config from '../payload.config'

const log = (step: string, data?: Record<string, unknown>) => {
  console.log(`[PAPER UPLOAD] ${step}`, data ? JSON.stringify(data, null, 2) : '')
}

export const uploadToOpenAI: CollectionAfterChangeHook = ({ doc, previousDoc, context }) => {
  log('Hook triggered', { docId: doc.id, filename: doc.filename, hasUrl: !!doc.url })

  // Prevent infinite loop when updating status
  if (context.skipOpenAIUpload) {
    log('Skipping - skipOpenAIUpload flag set', { docId: doc.id })
    return doc
  }

  // Only process new uploads or file changes
  const isNewFile = !previousDoc || doc.filename !== previousDoc?.filename
  if (!isNewFile) {
    log('Skipping - not a new file', { docId: doc.id, filename: doc.filename })
    return doc
  }

  // Skip if no URL (file not uploaded yet)
  if (!doc.url) {
    log('Skipping - no URL yet', { docId: doc.id })
    return doc
  }

  const docId = String(doc.id)

  // Mark as ready — the blog worker will handle OpenAI upload when blog generation is triggered
  const processingPromise = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    log('Marking paper as ready', { docId })
    const payload = await getPayload({ config })
    await payload.update({
      collection: 'papers',
      id: docId,
      data: { processingStatus: 'ready' },
      context: { skipOpenAIUpload: true },
    })
    log('Paper marked as ready', { docId })
  })()

  // Keep serverless function alive if on Vercel
  try {
    const { waitUntil } = require('@vercel/functions')
    waitUntil(processingPromise)
  } catch {
    // Not on Vercel, just let it run
  }

  log('Returning doc immediately', { docId: doc.id })
  return doc
}
