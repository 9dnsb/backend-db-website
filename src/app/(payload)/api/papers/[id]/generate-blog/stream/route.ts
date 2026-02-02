import { getPayload } from 'payload'
import configPromise from '@payload-config'
import OpenAI from 'openai'
import { markdownToLexical } from '@/lib/markdownToLexical'

// Enable edge runtime for streaming support
export const runtime = 'edge'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * System prompt for blog generation - GPT-5.2 optimized
 */
const BLOG_SYSTEM_PROMPT = `You are a health and wellness blog writer. Your task is to transform academic research papers into engaging, accessible blog posts.

## CRITICAL FORMATTING RULES (MUST FOLLOW)

### Section Headers — ALWAYS include descriptive subtitles
Every section header MUST have a colon followed by a brief, engaging subtitle. Never use generic headers.

❌ WRONG: "## 🔬 The Problem"
✅ RIGHT: "## 🔬 The Problem: Parents Are Confused About Starting Solids"

❌ WRONG: "## 📈 The Results"
✅ RIGHT: "## 📈 The Results: Both Methods Are Equally Safe"

### Results Section — MANDATORY FORMAT
You MUST format every finding in the Results section exactly like this:

✅ **[Conclusion in plain English]** — [supporting numbers without statistical notation]

⚖️ **[Conclusion in plain English]** — [supporting numbers without statistical notation]

❌ **[Conclusion in plain English]** — [supporting numbers without statistical notation]

EVERY finding MUST start with ✅, ⚖️, or ❌:
- ✅ for positive/beneficial findings
- ⚖️ for neutral/no-difference findings
- ❌ for negative findings or risks

NEVER use these in Results:
- Statistical notation: ±, P < .001, P > .05
- Units inline: g/dL, mg/day, kg
- Study author names: "(Smith et al.)"
- Dense paragraphs — use one finding per line

---

## Writing Style Guidelines

1. **Title Format**: Start with an emoji, then a catchy question format
   - Example: "🏃 Want to Run Faster? Try This Surprising Pre-Workout Snack"
   - Example: "💪 Struggling with Muscle Soreness? Science Has a Sweet Solution"

2. **Structure**: IMPORTANT - Follow this exact structure:

   a) **Citation Block** (REQUIRED - comes right after the title):
      Start with "Based on the [YEAR] study" followed by the paper title in quotes, authors (use "& others" if more than 3), journal name in italics, and DOI link if available.

   b) **Hook paragraph**: 1-2 engaging sentences that capture why this matters

   c) **Section headers with emojis and subtitles**:
      - ## 🔬 The Problem: [Subtitle]
      - ## 📊 The Study: [Subtitle]
      - ## 📈 The Results: [Subtitle]
      - ## 🧠 How It Works: [Subtitle]
      - ## 🎯 What This Means for You: [Subtitle]
      - ## ⚠️ Caveats
      - ## 💡 The Bottom Line

3. **Tone**: Conversational, accessible, use "you" directly, avoid jargon

4. **Formatting**:
   - Use **bold** for key findings
   - Use horizontal rules (---) between sections
   - Keep paragraphs short (2-4 sentences)

5. **Length**: 700-1000 words total

<uncertainty_and_ambiguity>
- If information is not clearly stated in the paper, acknowledge this limitation.
- Never fabricate statistics, percentages, or study details not found in the source material.
- When uncertain about specific numbers, use qualifiers like "approximately" or "the study suggests".
</uncertainty_and_ambiguity>

## Output Format
Return ONLY the markdown content. Start directly with the emoji title (e.g., "# 🏃 Want to Run Faster?..."), then immediately follow with the citation block.`

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

/**
 * Extract a meaningful excerpt from markdown content
 */
function extractExcerpt(markdown: string, maxLength: number = 500): string {
  const lines = markdown.split('\n')
  const paragraphs: string[] = []
  let currentParagraph = ''

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph)
        currentParagraph = ''
      }
      continue
    }

    if (trimmed.startsWith('#')) continue
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') continue
    if (trimmed.startsWith('>')) continue

    let cleaned = trimmed
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    if (cleaned.startsWith('- ') || cleaned.startsWith('* ') || /^\d+\.\s/.test(cleaned)) {
      cleaned = cleaned.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')
    }

    currentParagraph += (currentParagraph ? ' ' : '') + cleaned
  }

  if (currentParagraph) {
    paragraphs.push(currentParagraph)
  }

  let excerpt = ''
  for (const para of paragraphs) {
    if (!para.trim()) continue

    if (excerpt.length + para.length + 1 > maxLength) {
      if (excerpt.length > 100) break
      const remaining = maxLength - excerpt.length - 1
      excerpt += (excerpt ? ' ' : '') + para.slice(0, remaining).trim()
      break
    }
    excerpt += (excerpt ? ' ' : '') + para
  }

  excerpt = excerpt.trim()
  if (excerpt.length >= maxLength - 10) {
    const lastPeriod = excerpt.lastIndexOf('. ')
    if (lastPeriod > excerpt.length * 0.6) {
      excerpt = excerpt.slice(0, lastPeriod + 1)
    } else {
      excerpt = excerpt.slice(0, maxLength - 3).trim() + '...'
    }
  }

  return excerpt
}

/**
 * POST /api/papers/[id]/generate-blog/stream
 * Streaming blog generation endpoint - keeps connection alive past 10s limit
 * Client receives real-time progress updates
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const encoder = new TextEncoder()

  // Create a streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`))
      }

      try {
        sendEvent('status', { message: 'Starting blog generation...' })

        const payload = await getPayload({ config: configPromise })

        // Get the paper
        const paper = await payload.findByID({
          collection: 'papers',
          id,
        })

        if (!paper) {
          sendEvent('error', { message: 'Paper not found' })
          controller.close()
          return
        }

        // Validate paper state
        if (paper.processingStatus !== 'ready') {
          sendEvent('error', { message: 'Paper must be processed first' })
          controller.close()
          return
        }

        if (!paper.vectorStoreId) {
          sendEvent('error', { message: 'Paper must have a vector store ID' })
          controller.close()
          return
        }

        if (paper.blogGenerationStatus === 'completed' && paper.generatedBlogPost) {
          sendEvent('error', { message: 'Blog already generated', blogPostId: paper.generatedBlogPost })
          controller.close()
          return
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

        sendEvent('status', { message: 'Analyzing paper with AI...' })

        // Generate blog using streaming Responses API
        const userMessage = `Please read and analyze the attached academic paper titled "${paper.title}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

Focus on:
1. The main research question and why it matters
2. The methodology and participants
3. The key findings with specific numbers
4. The practical implications for readers

Remember to use the exact section structure and emoji headers specified in your instructions.`

        const response = await openai.responses.create({
          model: 'gpt-5.2',
          instructions: BLOG_SYSTEM_PROMPT,
          input: [{ role: 'user', content: userMessage }],
          tools: [
            {
              type: 'file_search',
              vector_store_ids: [paper.vectorStoreId],
            },
          ],
          reasoning: {
            effort: 'low',
          },
          text: {
            verbosity: 'medium',
          },
          max_output_tokens: 4096,
          stream: true,
        })

        let markdownContent = ''
        let responseStatus = ''

        // Stream the response
        for await (const event of response) {
          if (event.type === 'response.output_text.delta') {
            markdownContent += event.delta
            sendEvent('delta', { text: event.delta })
          }

          if (event.type === 'response.completed') {
            responseStatus = event.response.status
            sendEvent('status', { message: 'AI generation complete, saving blog post...' })
          }
        }

        if (responseStatus !== 'completed') {
          throw new Error(`Response failed with status: ${responseStatus}`)
        }

        if (!markdownContent) {
          throw new Error('No content generated')
        }

        // Extract title from markdown
        const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
        const blogTitle = titleMatch ? titleMatch[1].trim() : `Summary: ${paper.title}`

        // Remove the title from content to avoid duplication
        const contentWithoutTitle = markdownContent.replace(/^#\s+.+\n*/, '').trim()

        // Generate slug
        const baseSlug = generateSlug(blogTitle)
        const timestamp = Date.now()
        const slug = `${baseSlug}-${timestamp}`

        // Convert to Lexical
        const lexicalContent = markdownToLexical(contentWithoutTitle)

        // Get admin user for author
        const adminUsers = await payload.find({
          collection: 'users',
          where: { role: { equals: 'admin' } },
          limit: 1,
        })
        const authorId = adminUsers.docs[0]?.id

        if (!authorId) {
          throw new Error('No admin user found to set as author')
        }

        // Extract excerpt
        const excerpt = extractExcerpt(contentWithoutTitle)

        // Create blog post
        const blogPost = await payload.create({
          collection: 'blog-posts',
          data: {
            title: blogTitle,
            slug,
            content: lexicalContent,
            excerpt,
            publishedDate: new Date().toISOString(),
            author: authorId,
            sourcePaper: id,
            status: 'draft',
          },
        })

        // Update paper with success
        await payload.update({
          collection: 'papers',
          id,
          data: {
            generatedBlogPost: blogPost.id,
            blogGenerationStatus: 'completed',
          },
          context: { skipOpenAIUpload: true },
        })

        sendEvent('done', {
          blogPostId: blogPost.id,
          blogTitle,
          slug,
        })

      } catch (error) {
        console.error('[GENERATE-BLOG-STREAM] Error:', error)

        // Try to update paper with error status
        try {
          const payload = await getPayload({ config: configPromise })
          await payload.update({
            collection: 'papers',
            id,
            data: {
              blogGenerationStatus: 'error',
              blogGenerationError: error instanceof Error ? error.message : 'Unknown error',
            },
            context: { skipOpenAIUpload: true },
          })
        } catch {
          // Ignore update errors
        }

        sendEvent('error', {
          message: error instanceof Error ? error.message : 'Blog generation failed',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
