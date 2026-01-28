import type { CollectionAfterChangeHook } from 'payload'
import OpenAI, { toFile } from 'openai'
import { getPayload } from 'payload'
import config from '../payload.config'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const log = (step: string, data?: Record<string, unknown>) => {
  console.log(`[PAPER UPLOAD] ${step}`, data ? JSON.stringify(data, null, 2) : '')
}

const logError = (step: string, error: unknown, data?: Record<string, unknown>) => {
  console.error(`[PAPER UPLOAD ERROR] ${step}`, {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    ...data,
  })
}

export const uploadToOpenAI: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  context,
}) => {
  log('Hook triggered', { docId: doc.id, filename: doc.filename, hasUrl: !!doc.url })

  // Prevent infinite loop when updating with OpenAI IDs
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

  // Skip if already processed
  if (doc.vectorStoreId) {
    log('Skipping - already has vectorStoreId', { docId: doc.id, vectorStoreId: doc.vectorStoreId })
    return doc
  }

  // Skip if no URL (file not uploaded yet)
  if (!doc.url) {
    log('Skipping - no URL yet', { docId: doc.id })
    return doc
  }

  // Capture values we need for async processing
  const docId = String(doc.id)
  const docUrl = doc.url
  const docFilename = doc.filename
  const docTitle = doc.title

  log('Starting async processing', { docId, docUrl, docFilename, docTitle })

  // Fire-and-forget: process in background without blocking save
  void (async () => {
    // Small delay to ensure the document is fully saved to the database
    await new Promise((resolve) => setTimeout(resolve, 1000))
    log('Getting fresh Payload instance', { docId })
    const payload = await getPayload({ config })
    log('Got Payload instance', { docId })

    try {
      // Update status to processing
      log('Step 1/5: Updating status to processing', { docId })
      await payload.update({
        collection: 'papers',
        id: docId,
        data: { processingStatus: 'processing' },
        context: { skipOpenAIUpload: true },
      })
      log('Step 1/5: Status updated to processing', { docId })

      // Fetch the PDF from Vercel Blob URL
      log('Step 2/5: Fetching PDF from Blob storage', { docId, url: docUrl })
      const response = await fetch(docUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      log('Step 2/5: PDF fetched successfully', { docId, sizeBytes: buffer.length })

      // 1. Upload file to OpenAI using toFile helper
      log('Step 3/5: Uploading file to OpenAI', { docId, filename: docFilename })
      const file = await openai.files.create({
        file: await toFile(buffer, docFilename, { type: 'application/pdf' }),
        purpose: 'assistants',
      })
      log('Step 3/5: File uploaded to OpenAI', { docId, openaiFileId: file.id })

      // 2. Create vector store
      log('Step 4/5: Creating vector store', { docId, name: docTitle || docFilename })
      const vectorStore = await openai.vectorStores.create({
        name: docTitle || docFilename,
      })
      log('Step 4/5: Vector store created', { docId, vectorStoreId: vectorStore.id })

      // 3. Add file to vector store and wait for indexing
      log('Step 4/5: Adding file to vector store and polling for completion', { docId, vectorStoreId: vectorStore.id, fileId: file.id })
      const vectorStoreFile = await openai.vectorStores.files.createAndPoll(vectorStore.id, {
        file_id: file.id,
      })
      log('Step 4/5: File indexed in vector store', { docId, status: vectorStoreFile.status })

      // 4. Update document with OpenAI IDs
      log('Step 5/5: Updating document with OpenAI IDs', { docId, openaiFileId: file.id, vectorStoreId: vectorStore.id })
      await payload.update({
        collection: 'papers',
        id: docId,
        data: {
          openaiFileId: file.id,
          vectorStoreId: vectorStore.id,
          processingStatus: 'ready',
        },
        context: { skipOpenAIUpload: true },
      })
      log('Step 5/5: Document updated successfully', { docId })

      log('COMPLETE: Paper processed successfully', { docId, title: docTitle, openaiFileId: file.id, vectorStoreId: vectorStore.id })
    } catch (error) {
      logError('Processing failed', error, { docId, docTitle })

      try {
        log('Attempting to update document with error status', { docId })
        await payload.update({
          collection: 'papers',
          id: docId,
          data: {
            processingStatus: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
          context: { skipOpenAIUpload: true },
        })
        log('Document updated with error status', { docId })
      } catch (updateError) {
        logError('Failed to update error status', updateError, { docId })
      }
    }
  })()

  log('Returning doc immediately (async processing started)', { docId: doc.id })
  return doc
}
