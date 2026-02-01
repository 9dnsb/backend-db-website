import OpenAI from 'openai'
import { getPayload } from 'payload'
import config from '../payload.config'
import { markdownToLexical } from '../lib/markdownToLexical'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const log = (step: string, data?: Record<string, unknown>) => {
  console.log(`[BLOG GENERATION] ${step}`, data ? JSON.stringify(data, null, 2) : '')
}

const logError = (step: string, error: unknown, data?: Record<string, unknown>) => {
  console.error(`[BLOG GENERATION ERROR] ${step}`, {
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    ...data,
  })
}

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, 100) // Limit length
}

/**
 * System prompt for blog generation - defines the writing style
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
 * Generate a blog post from a paper using OpenAI
 */
export async function generateBlogFromPaper(
  paperId: string,
  paperTitle: string,
  vectorStoreId: string
): Promise<void> {
  log('Starting blog generation', { paperId, paperTitle, vectorStoreId })

  const payload = await getPayload({ config })

  try {
    // Update status to generating
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: { blogGenerationStatus: 'generating' },
      context: { skipOpenAIUpload: true },
    })

    // Check if paper already has a generated blog post
    const paper = await payload.findByID({
      collection: 'papers',
      id: paperId,
    })

    if (paper.generatedBlogPost) {
      log('Paper already has generated blog post, skipping', { paperId })
      await payload.update({
        collection: 'papers',
        id: paperId,
        data: { blogGenerationStatus: 'skipped' },
        context: { skipOpenAIUpload: true },
      })
      return
    }

    // Create a thread with the vector store attached
    log('Creating OpenAI thread with vector store', { vectorStoreId })
    const thread = await openai.beta.threads.create({
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStoreId],
        },
      },
    })
    log('Thread created', { threadId: thread.id })

    // Add the user message requesting blog generation
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `Please read and analyze the attached academic paper titled "${paperTitle}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

Focus on:
1. The main research question and why it matters
2. The methodology and participants
3. The key findings with specific numbers
4. The practical implications for readers

Remember to use the exact section structure and emoji headers specified in your instructions.`,
    })

    // Run the assistant
    log('Running assistant to generate blog', { paperId })
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: await getOrCreateBlogAssistant(),
      tool_choice: { type: 'file_search' },
    })

    if (run.status !== 'completed') {
      throw new Error(`Run failed with status: ${run.status}`)
    }

    // Get the generated content
    const messages = await openai.beta.threads.messages.list(thread.id)
    const assistantMessage = messages.data.find((m) => m.role === 'assistant')

    if (!assistantMessage || assistantMessage.content[0].type !== 'text') {
      throw new Error('No text response from assistant')
    }

    const markdownContent = assistantMessage.content[0].text.value
    log('Blog content generated', { paperId, contentLength: markdownContent.length })

    // Extract title from markdown (first line starting with #)
    const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
    const blogTitle = titleMatch ? titleMatch[1].trim() : `Summary: ${paperTitle}`

    // Generate slug from title
    const baseSlug = generateSlug(blogTitle)
    const timestamp = Date.now()
    const slug = `${baseSlug}-${timestamp}`

    // Convert markdown to Lexical format
    const lexicalContent = markdownToLexical(markdownContent)

    // Get admin user for author (first admin user)
    const adminUsers = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 1,
    })
    const authorId = adminUsers.docs[0]?.id

    if (!authorId) {
      throw new Error('No admin user found to set as author')
    }

    // Create the blog post
    log('Creating blog post', { paperId, slug, blogTitle })
    const blogPost = await payload.create({
      collection: 'blog-posts',
      data: {
        title: blogTitle,
        slug,
        content: lexicalContent,
        excerpt: `AI-generated summary of the research paper: ${paperTitle}`,
        publishedDate: new Date().toISOString(),
        author: authorId,
        sourcePaper: paperId,
        status: 'draft',
      },
    })
    log('Blog post created', { paperId, blogPostId: blogPost.id })

    // Update paper with the generated blog post reference
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: {
        generatedBlogPost: blogPost.id,
        blogGenerationStatus: 'completed',
      },
      context: { skipOpenAIUpload: true },
    })

    log('COMPLETE: Blog generated successfully', {
      paperId,
      blogPostId: blogPost.id,
      blogTitle,
      slug,
    })

    // Clean up thread
    await openai.beta.threads.del(thread.id)
  } catch (error) {
    logError('Blog generation failed', error, { paperId, paperTitle })

    try {
      await payload.update({
        collection: 'papers',
        id: paperId,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: error instanceof Error ? error.message : 'Unknown error',
        },
        context: { skipOpenAIUpload: true },
      })
    } catch (updateError) {
      logError('Failed to update error status', updateError, { paperId })
    }
  }
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

  // Check if assistant already exists
  const assistants = await openai.beta.assistants.list({ limit: 100 })
  const existing = assistants.data.find((a) => a.name === assistantName)

  if (existing) {
    cachedAssistantId = existing.id
    log('Using existing assistant', { assistantId: existing.id })
    return existing.id
  }

  // Create new assistant
  log('Creating new blog assistant')
  const assistant = await openai.beta.assistants.create({
    name: assistantName,
    instructions: BLOG_SYSTEM_PROMPT,
    model: 'gpt-4.1',
    tools: [{ type: 'file_search' }],
  })

  cachedAssistantId = assistant.id
  log('Created new assistant', { assistantId: assistant.id })
  return assistant.id
}
