import { getPayload } from 'payload'
import configPromise from '@payload-config'

/**
 * POST /api/papers/[id]/generate-blog
 *
 * Returns info about how to generate a blog post.
 *
 * For Vercel Hobby plan (10s timeout), use the STREAMING endpoint:
 *   POST /api/papers/[id]/generate-blog/stream
 *   - Returns Server-Sent Events with real-time progress
 *   - Keeps connection alive past 10s limit via streaming
 *   - Frontend must handle SSE stream
 *
 * This endpoint validates the paper and returns the streaming URL.
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

    // Return info about streaming endpoint
    const baseUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL || new URL(request.url).origin
    const streamUrl = `${baseUrl}/api/papers/${id}/generate-blog/stream`

    return Response.json({
      status: 'ready',
      message: 'Paper is ready for blog generation. Use the streaming endpoint.',
      paperId: id,
      streamUrl,
      instructions: 'POST to streamUrl and consume Server-Sent Events for real-time progress.',
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to check paper status' },
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
