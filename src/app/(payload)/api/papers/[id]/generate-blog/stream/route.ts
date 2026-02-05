import { getPayload } from 'payload'
import configPromise from '@payload-config'

/**
 * GET /api/papers/[id]/generate-blog/stream
 *
 * Server-Sent Events endpoint for live blog generation status updates.
 * Polls MongoDB every 2 seconds and streams status changes to the client.
 * Auto-closes on completion, error, or after 2 minutes timeout.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const encoder = new TextEncoder()
  const maxDuration = 2 * 60 * 1000 // 2 minutes timeout
  const pollInterval = 2000 // 2 seconds

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now()

      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const payload = await getPayload({ config: configPromise })

        // Initial status check
        const paper = await payload.findByID({
          collection: 'papers',
          id,
        })

        if (!paper) {
          sendEvent({ status: 'error', message: 'Paper not found' })
          controller.close()
          return
        }

        // If already completed or errored, send that immediately
        if (paper.blogGenerationStatus === 'completed' && paper.generatedBlogPost) {
          sendEvent({
            status: 'completed',
            blogPostId: paper.generatedBlogPost,
          })
          controller.close()
          return
        }

        if (paper.blogGenerationStatus === 'error') {
          sendEvent({
            status: 'error',
            message: paper.blogGenerationError || 'Unknown error',
          })
          controller.close()
          return
        }

        // Send initial progress immediately (don't wait for first poll)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialProgress = (paper as any).blogGenerationProgress as string | undefined
        sendEvent({
          status: 'generating',
          message: initialProgress || 'Blog generation in progress...',
        })

        // Poll for status changes
        const poll = async () => {
          // Check timeout
          if (Date.now() - startTime > maxDuration) {
            sendEvent({
              status: 'timeout',
              message: 'Status check timed out after 2 minutes. Refresh to check status.',
            })
            controller.close()
            return
          }

          try {
            const currentPaper = await payload.findByID({
              collection: 'papers',
              id,
            })

            if (!currentPaper) {
              sendEvent({ status: 'error', message: 'Paper not found' })
              controller.close()
              return
            }

            if (currentPaper.blogGenerationStatus === 'completed' && currentPaper.generatedBlogPost) {
              // Fetch the blog post to get its title
              let blogTitle = 'Blog post'
              try {
                const blogPost = await payload.findByID({
                  collection: 'blog-posts',
                  id: currentPaper.generatedBlogPost as string,
                })
                if (blogPost?.title) {
                  blogTitle = blogPost.title
                }
              } catch {
                // Ignore error fetching blog title
              }

              sendEvent({
                status: 'completed',
                blogPostId: currentPaper.generatedBlogPost,
                blogTitle,
              })
              controller.close()
              return
            }

            if (currentPaper.blogGenerationStatus === 'error') {
              sendEvent({
                status: 'error',
                message: currentPaper.blogGenerationError || 'Unknown error',
              })
              controller.close()
              return
            }

            // Still generating - send progress message from MongoDB
            sendEvent({
              status: 'generating',
              message: (currentPaper.blogGenerationProgress as string) || 'Blog generation in progress...',
            })

            // Schedule next poll
            setTimeout(poll, pollInterval)
          } catch (error) {
            console.error('[SSE] Error polling status:', error)
            sendEvent({
              status: 'error',
              message: error instanceof Error ? error.message : 'Failed to check status',
            })
            controller.close()
          }
        }

        // Start polling
        poll()
      } catch (error) {
        console.error('[SSE] Error initializing stream:', error)
        sendEvent({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to initialize status stream',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
