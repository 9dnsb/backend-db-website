import { getPayload } from 'payload'
import configPromise from '@payload-config'
import OpenAI from 'openai'
import { markdownToLexical } from '@/lib/markdownToLexical'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * System prompt for blog generation
 */
const BLOG_SYSTEM_PROMPT = `You are a health and wellness blog writer. Your task is to transform academic research papers into engaging, accessible blog posts.

## Writing Style Guidelines

1. **Title Format**: Start with an emoji, then a catchy question format that relates to a common problem or desire
   - Example: "🏃 Want to Run Faster? Try This Surprising Pre-Workout Snack"
   - Example: "💪 Struggling with Muscle Soreness? Science Has a Sweet Solution"

2. **Structure**: Use these exact section headers with emojis:
   - ## 🔬 The Problem (or The Question)
   - ## 📊 The Study
   - ## 📈 The Results
   - ## 🧠 How It Works (or Why This Works)
   - ## 🎯 What This Means for You
   - ## ⚠️ Caveats
   - ## 💡 The Bottom Line

3. **Tone**:
   - Conversational and accessible - write like you're explaining to a friend
   - Use "you" to address the reader directly
   - Avoid jargon - explain technical terms simply
   - Be enthusiastic but not over-the-top

4. **Formatting**:
   - Use **bold** for key statistics and important findings
   - Use horizontal rules (---) between major sections
   - Keep paragraphs short (2-4 sentences)
   - Include specific numbers from the study

5. **Content Guidelines**:
   - The Problem: Set up why this research matters. What's the everyday struggle?
   - The Study: Methodology details - participants, duration, what they did
   - The Results: Specific findings with numbers. What percentage improved? By how much?
   - How It Works: The mechanism - why does this intervention work?
   - What This Means for You: Practical, actionable takeaways
   - Caveats: Study limitations honestly stated
   - The Bottom Line: A memorable closing blockquote (use > for blockquote)

6. **Length**: Aim for 600-900 words total.

## Output Format
Return ONLY the markdown content of the blog post. Do not include any preamble or explanation.
Start directly with the emoji title (e.g., "# 🏃 Want to Run Faster?...")`

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
 * Get or create the blog generation assistant
 */
let cachedAssistantId: string | null = null

async function getOrCreateBlogAssistant(): Promise<string> {
  if (cachedAssistantId) {
    return cachedAssistantId
  }

  const assistantName = 'Blog Post Generator'
  const assistants = await openai.beta.assistants.list({ limit: 100 })
  const existing = assistants.data.find((a) => a.name === assistantName)

  if (existing) {
    cachedAssistantId = existing.id
    return existing.id
  }

  const assistant = await openai.beta.assistants.create({
    name: assistantName,
    instructions: BLOG_SYSTEM_PROMPT,
    model: 'gpt-4.1',
    tools: [{ type: 'file_search' }],
  })

  cachedAssistantId = assistant.id
  return assistant.id
}

/**
 * POST /api/papers/[id]/generate-blog
 * Starts blog generation - creates thread and run, returns immediately
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

    // Check if already generating or completed
    if (paper.blogGenerationStatus === 'generating' && paper.blogRunId) {
      return Response.json(
        { error: 'Blog generation already in progress', runId: paper.blogRunId },
        { status: 400 }
      )
    }

    if (paper.blogGenerationStatus === 'completed' && paper.generatedBlogPost) {
      return Response.json(
        { error: 'Blog already generated', blogPostId: paper.generatedBlogPost },
        { status: 400 }
      )
    }

    // Create thread with vector store
    const thread = await openai.beta.threads.create({
      tool_resources: {
        file_search: {
          vector_store_ids: [paper.vectorStoreId],
        },
      },
    })

    // Add user message
    const userMessageContent = `Please read and analyze the attached academic paper titled "${paper.title}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

Focus on:
1. The main research question and why it matters
2. The methodology and participants
3. The key findings with specific numbers
4. The practical implications for readers

Remember to use the exact section structure and emoji headers specified in your instructions.`

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userMessageContent,
    })

    // Get assistant
    const assistantId = await getOrCreateBlogAssistant()

    // Start run (don't poll - just create and return)
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      tool_choice: { type: 'file_search' },
    })

    // Update paper with thread and run IDs
    await payload.update({
      collection: 'papers',
      id,
      data: {
        blogGenerationStatus: 'generating',
        blogThreadId: thread.id,
        blogRunId: run.id,
        blogGenerationError: null,
      },
      context: { skipOpenAIUpload: true },
    })

    return Response.json({
      success: true,
      message: 'Blog generation started',
      threadId: thread.id,
      runId: run.id,
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error starting generation:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to start generation' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/papers/[id]/generate-blog
 * Checks run status and saves blog if complete
 */
export async function GET(
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

    const threadId = paper.blogThreadId
    const runId = paper.blogRunId

    if (!threadId || !runId) {
      return Response.json(
        { error: 'No active blog generation. Call POST first to start.' },
        { status: 400 }
      )
    }

    // Check run status
    const run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId })

    if (run.status === 'queued' || run.status === 'in_progress') {
      return Response.json({
        status: 'in_progress',
        runStatus: run.status,
        message: 'Blog generation is still running. Check again in a few seconds.',
      })
    }

    if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
      // Update paper with error
      await payload.update({
        collection: 'papers',
        id,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: `Run ${run.status}: ${JSON.stringify(run.last_error)}`,
        },
        context: { skipOpenAIUpload: true },
      })

      return Response.json({
        status: 'error',
        runStatus: run.status,
        error: run.last_error,
      })
    }

    if (run.status === 'completed') {
      // Get the generated content
      const messages = await openai.beta.threads.messages.list(threadId)
      const assistantMessage = messages.data.find((m) => m.role === 'assistant')

      if (!assistantMessage || assistantMessage.content[0].type !== 'text') {
        return Response.json({
          status: 'error',
          error: 'No text response from assistant',
        }, { status: 500 })
      }

      const markdownContent = assistantMessage.content[0].text.value

      // Extract title from markdown
      const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
      const blogTitle = titleMatch ? titleMatch[1].trim() : `Summary: ${paper.title}`

      // Generate slug
      const baseSlug = generateSlug(blogTitle)
      const timestamp = Date.now()
      const slug = `${baseSlug}-${timestamp}`

      // Convert to Lexical
      const lexicalContent = markdownToLexical(markdownContent)

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

      // Create blog post
      const blogPost = await payload.create({
        collection: 'blog-posts',
        data: {
          title: blogTitle,
          slug,
          content: lexicalContent,
          excerpt: `AI-generated summary of the research paper: ${paper.title}`,
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
          blogThreadId: null,
          blogRunId: null,
        },
        context: { skipOpenAIUpload: true },
      })

      // Clean up thread
      try {
        await openai.beta.threads.delete(threadId)
      } catch {
        // Ignore cleanup errors
      }

      return Response.json({
        status: 'completed',
        blogPostId: blogPost.id,
        blogTitle,
        slug,
      })
    }

    // Unknown status
    return Response.json({
      status: 'unknown',
      runStatus: run.status,
    })
  } catch (error) {
    console.error('[GENERATE-BLOG] Error checking status:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}
