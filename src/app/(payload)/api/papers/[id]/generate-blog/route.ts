import { getPayload } from 'payload'
import configPromise from '@payload-config'
import OpenAI from 'openai'
import { markdownToLexical } from '@/lib/markdownToLexical'

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
 * POST /api/papers/[id]/generate-blog
 * Generates blog using GPT-5.2 Responses API (synchronous)
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

    // Generate blog using Responses API with GPT-5.2
    const userMessage = `Please read and analyze the attached academic paper titled "${paper.title}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

Focus on:
1. The main research question and why it matters
2. The methodology and participants
3. The key findings with specific numbers
4. The practical implications for readers

Remember to use the exact section structure and emoji headers specified in your instructions.`

    console.log('[GENERATE-BLOG] Starting GPT-5.2 Responses API call...')
    const startTime = Date.now()

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
      // GPT-5.2 specific settings
      reasoning: {
        effort: 'low', // Some reasoning for better quality
      },
      text: {
        verbosity: 'medium', // Balanced output
      },
      max_output_tokens: 4096,
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[GENERATE-BLOG] Response received in ${duration}s, status: ${response.status}`)

    if (response.status !== 'completed') {
      await payload.update({
        collection: 'papers',
        id,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: `Response failed: ${response.status} - ${JSON.stringify(response.error)}`,
        },
        context: { skipOpenAIUpload: true },
      })

      return Response.json({
        status: 'error',
        error: response.error || `Response status: ${response.status}`,
      }, { status: 500 })
    }

    // Extract the generated content
    const markdownContent = response.output_text

    if (!markdownContent) {
      await payload.update({
        collection: 'papers',
        id,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: 'No text content in response',
        },
        context: { skipOpenAIUpload: true },
      })

      return Response.json({
        status: 'error',
        error: 'No text content in response',
      }, { status: 500 })
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
      return Response.json({
        status: 'error',
        error: 'No admin user found to set as author',
      }, { status: 500 })
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

    // Update paper
    await payload.update({
      collection: 'papers',
      id,
      data: {
        generatedBlogPost: blogPost.id,
        blogGenerationStatus: 'completed',
      },
      context: { skipOpenAIUpload: true },
    })

    console.log(`[GENERATE-BLOG] Blog created successfully: ${blogPost.id}`)

    return Response.json({
      status: 'completed',
      blogPostId: blogPost.id,
      blogTitle,
      slug,
      model: 'gpt-5.2',
      api: 'Responses API',
      duration: `${duration}s`,
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error:', error)

    // Try to update paper status
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

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate blog' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/papers/[id]/generate-blog
 * Returns current blog generation status
 * Note: With Responses API, generation is synchronous so this just returns status
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
        message: 'Blog generation is in progress. With Responses API, this should complete quickly.',
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
