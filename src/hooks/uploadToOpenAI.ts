import type { CollectionAfterChangeHook } from 'payload'
import OpenAI, { toFile } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const uploadToOpenAI: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  // Prevent infinite loop when updating with OpenAI IDs
  if (context.skipOpenAIUpload) {
    return doc
  }

  // Only process new uploads or file changes
  const isNewFile = !previousDoc || doc.filename !== previousDoc?.filename
  if (!isNewFile) {
    return doc
  }

  // Skip if already processed
  if (doc.vectorStoreId) {
    return doc
  }

  // Skip if no URL (file not uploaded yet)
  if (!doc.url) {
    return doc
  }

  // Fire-and-forget: process in background without blocking save
  void (async () => {
    try {
      // Update status to processing
      await req.payload.update({
        collection: 'papers',
        id: doc.id,
        data: { processingStatus: 'processing' },
        context: { skipOpenAIUpload: true },
      })

      // Fetch the PDF from Vercel Blob URL
      const response = await fetch(doc.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 1. Upload file to OpenAI using toFile helper
      const file = await openai.files.create({
        file: await toFile(buffer, doc.filename, { type: 'application/pdf' }),
        purpose: 'assistants',
      })

      // 2. Create vector store
      const vectorStore = await openai.vectorStores.create({
        name: doc.title || doc.filename,
      })

      // 3. Add file to vector store and wait for indexing
      await openai.vectorStores.files.createAndPoll(vectorStore.id, {
        file_id: file.id,
      })

      // 4. Update document with OpenAI IDs
      await req.payload.update({
        collection: 'papers',
        id: doc.id,
        data: {
          openaiFileId: file.id,
          vectorStoreId: vectorStore.id,
          processingStatus: 'ready',
        },
        context: { skipOpenAIUpload: true },
      })

      console.log(`Paper "${doc.title}" processed successfully`)
    } catch (error) {
      console.error('OpenAI upload error:', error)

      await req.payload.update({
        collection: 'papers',
        id: doc.id,
        data: {
          processingStatus: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
        context: { skipOpenAIUpload: true },
      })
    }
  })()

  // Return immediately - processing continues in background
  return doc
}
