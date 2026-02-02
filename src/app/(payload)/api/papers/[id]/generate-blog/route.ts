import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Client } from '@upstash/qstash'

// Initialize QStash client
const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
})

/**
 * Get the base URL for the worker endpoint
 * Uses PAYLOAD_PUBLIC_SERVER_URL in production, falls back to request origin
 */
function getWorkerUrl(request: Request, paperId: string): string {
  const baseUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL || new URL(request.url).origin
  return `${baseUrl}/api/papers/${paperId}/generate-blog/worker`
}

/**
 * POST /api/papers/[id]/generate-blog
 * Triggers blog generation via QStash
 * Returns immediately - QStash will call the worker endpoint
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const payload = await getPayload({ config: configPromise })

    // Get the paper
    const paper = await payload.findByID({
      collection: 'papers',
      id,
    })

    if (!paper) {
      return Response.json({ error: 'Paper not found' }, { status: 404 })
    }

    // Check if paper is ready for blog generation
    if (paper.processingStatus !== 'ready') {
      return Response.json(
        { error: 'Paper must be processed first (processingStatus must be "ready")' },
        { status: 400 }
      )
    }

    if (!paper.vectorStoreId) {
      return Response.json(
        { error: 'Paper must have a vector store ID' },
        { status: 400 }
      )
    }

    // Check if already completed
    if (paper.blogGenerationStatus === 'completed' && paper.generatedBlogPost) {
      return Response.json(
        { error: 'Blog already generated', blogPostId: paper.generatedBlogPost },
        { status: 400 }
      )
    }

    // Check if already generating
    if (paper.blogGenerationStatus === 'generating') {
      return Response.json(
        { error: 'Blog generation already in progress' },
        { status: 400 }
      )
    }

    // Update status to generating
    await payload.update({
      collection: 'papers',
      id,
      data: {
        blogGenerationStatus: 'generating',
        blogGenerationError: null,
      },
      context: { skipOpenAIUpload: true },
    })

    // Queue the blog generation via QStash
    const workerUrl = getWorkerUrl(request, id)
    console.log(`[GENERATE-BLOG] Queuing blog generation via QStash: ${workerUrl}`)

    const qstashResponse = await qstash.publishJSON({
      url: workerUrl,
      body: {
        paperId: id,
        paperTitle: paper.title,
        vectorStoreId: paper.vectorStoreId,
      },
      // Retry configuration
      retries: 3,
    })

    console.log(`[GENERATE-BLOG] QStash message queued: ${qstashResponse.messageId}`)

    // Return immediately with "started" status
    return Response.json({
      status: 'started',
      message: 'Blog generation has been queued. Poll GET endpoint for status.',
      paperId: id,
      qstashMessageId: qstashResponse.messageId,
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error queuing generation:', error)

    // Try to reset paper status on error
    try {
      const payload = await getPayload({ config: configPromise })
      await payload.update({
        collection: 'papers',
        id,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: error instanceof Error ? error.message : 'Failed to queue generation',
        },
        context: { skipOpenAIUpload: true },
      })
    } catch {
      // Ignore update errors
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to start blog generation' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/papers/[id]/generate-blog
 * Returns current blog generation status
 * Poll this endpoint to check if QStash worker has completed
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const payload = await getPayload({ config: configPromise })

    const paper = await payload.findByID({
      collection: 'papers',
      id,
    })

    if (!paper) {
      return Response.json({ error: 'Paper not found' }, { status: 404 })
    }

    if (paper.blogGenerationStatus === 'completed' && paper.generatedBlogPost) {
      return Response.json({
        status: 'completed',
        blogPostId: paper.generatedBlogPost,
      })
    }

    if (paper.blogGenerationStatus === 'error') {
      return Response.json({
        status: 'error',
        error: paper.blogGenerationError || 'Unknown error',
      })
    }

    if (paper.blogGenerationStatus === 'generating') {
      return Response.json({
        status: 'in_progress',
        message: 'Blog generation is in progress. This typically takes 20-40 seconds.',
      })
    }

    return Response.json({
      status: 'not_started',
      message: 'Blog generation has not been started. Call POST to generate.',
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error checking status:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}
