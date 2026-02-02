import { getPayload } from 'payload'
import configPromise from '@payload-config'

/**
 * POST /api/papers/[id]/generate-blog
 *
 * Triggers blog generation via external Render worker.
 * Returns immediately - the worker runs asynchronously with no timeout limits.
 *
 * Required env vars:
 *   - BLOG_WORKER_URL: URL of the Render worker (e.g., https://blog-worker.onrender.com)
 *   - BLOG_WORKER_SECRET: Shared secret for authentication
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

    // Check for worker configuration
    const workerUrl = process.env.BLOG_WORKER_URL
    const workerSecret = process.env.BLOG_WORKER_SECRET

    if (!workerUrl || !workerSecret) {
      console.error('[GENERATE-BLOG] Missing BLOG_WORKER_URL or BLOG_WORKER_SECRET')
      return Response.json(
        { error: 'Blog worker not configured' },
        { status: 500 }
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

    // Call the Render worker (fire and forget - don't await)
    // Retry logic handles Render free tier cold starts (~60s wake time)
    const workerEndpoint = `${workerUrl}/generate-blog`
    const requestBody = JSON.stringify({
      paperId: id,
      paperTitle: paper.title,
      vectorStoreId: paper.vectorStoreId,
    })

    const callWorkerWithRetry = async (retries = 3, delay = 5000) => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`[GENERATE-BLOG] Calling worker (attempt ${i + 1}/${retries}): ${workerEndpoint}`)
          const res = await fetch(workerEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${workerSecret}`,
            },
            body: requestBody,
          })
          console.log(`[GENERATE-BLOG] Worker responded with status: ${res.status}`)
          return
        } catch (err) {
          console.error(`[GENERATE-BLOG] Worker call failed (attempt ${i + 1}):`, err)
          if (i < retries - 1) {
            console.log(`[GENERATE-BLOG] Retrying in ${delay / 1000}s...`)
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }
      console.error(`[GENERATE-BLOG] All ${retries} attempts failed`)
    }

    // Fire and forget - don't await
    callWorkerWithRetry()

    // Return immediately
    return Response.json({
      status: 'started',
      message: 'Blog generation has been started. Poll GET endpoint for status.',
      paperId: id,
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error:', error)

    // Try to reset paper status on error
    try {
      const payload = await getPayload({ config: configPromise })
      await payload.update({
        collection: 'papers',
        id,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: error instanceof Error ? error.message : 'Failed to start generation',
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
 * Poll this endpoint to check if worker has completed
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
