import type { CollectionBeforeDeleteHook } from 'payload'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const deleteFromOpenAI: CollectionBeforeDeleteHook = async ({ req, id }) => {
  try {
    // Fetch the document to get OpenAI IDs
    const doc = await req.payload.findByID({
      collection: 'papers',
      id,
    })

    if (!doc) return

    // Delete vector store first (it references the file)
    if (doc.vectorStoreId) {
      try {
        await openai.vectorStores.delete(doc.vectorStoreId)
        console.log(`Deleted vector store: ${doc.vectorStoreId}`)
      } catch (error) {
        console.error(`Failed to delete vector store ${doc.vectorStoreId}:`, error)
      }
    }

    // Delete the file from OpenAI
    if (doc.openaiFileId) {
      try {
        await openai.files.delete(doc.openaiFileId)
        console.log(`Deleted OpenAI file: ${doc.openaiFileId}`)
      } catch (error) {
        console.error(`Failed to delete OpenAI file ${doc.openaiFileId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error in deleteFromOpenAI hook:', error)
    // Don't throw - allow deletion to proceed even if OpenAI cleanup fails
  }
}
