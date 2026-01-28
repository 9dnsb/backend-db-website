import type { CollectionBeforeDeleteHook } from 'payload'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const log = (step: string, data?: Record<string, unknown>) => {
  console.log(`[PAPER DELETE] ${step}`, data ? JSON.stringify(data, null, 2) : '')
}

const logError = (step: string, error: unknown, data?: Record<string, unknown>) => {
  console.error(`[PAPER DELETE ERROR] ${step}`, {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    ...data,
  })
}

export const deleteFromOpenAI: CollectionBeforeDeleteHook = async ({ req, id }) => {
  log('Hook triggered', { docId: id })

  try {
    // Fetch the document to get OpenAI IDs
    log('Step 1/3: Fetching document to get OpenAI IDs', { docId: id })
    const doc = await req.payload.findByID({
      collection: 'papers',
      id,
    })

    if (!doc) {
      log('Document not found, nothing to clean up', { docId: id })
      return
    }

    log('Step 1/3: Document found', {
      docId: id,
      title: doc.title,
      vectorStoreId: doc.vectorStoreId || 'none',
      openaiFileId: doc.openaiFileId || 'none',
    })

    // Delete vector store first (it references the file)
    if (doc.vectorStoreId) {
      log('Step 2/3: Deleting vector store from OpenAI', { docId: id, vectorStoreId: doc.vectorStoreId })
      try {
        await openai.vectorStores.delete(doc.vectorStoreId)
        log('Step 2/3: Vector store deleted successfully', { docId: id, vectorStoreId: doc.vectorStoreId })
      } catch (error) {
        logError('Step 2/3: Failed to delete vector store', error, { docId: id, vectorStoreId: doc.vectorStoreId })
      }
    } else {
      log('Step 2/3: No vector store to delete', { docId: id })
    }

    // Delete the file from OpenAI
    if (doc.openaiFileId) {
      log('Step 3/3: Deleting file from OpenAI', { docId: id, openaiFileId: doc.openaiFileId })
      try {
        await openai.files.delete(doc.openaiFileId)
        log('Step 3/3: File deleted successfully', { docId: id, openaiFileId: doc.openaiFileId })
      } catch (error) {
        logError('Step 3/3: Failed to delete file', error, { docId: id, openaiFileId: doc.openaiFileId })
      }
    } else {
      log('Step 3/3: No OpenAI file to delete', { docId: id })
    }

    log('COMPLETE: OpenAI cleanup finished', { docId: id, title: doc.title })
  } catch (error) {
    logError('Hook failed', error, { docId: id })
    // Don't throw - allow deletion to proceed even if OpenAI cleanup fails
  }
}
