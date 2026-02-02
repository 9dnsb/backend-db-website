import OpenAI from 'openai'
import { getPayload } from 'payload'
import config from '../payload.config'
import { markdownToLexical } from '../lib/markdownToLexical'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const LOG_PREFIX = '[BLOG GENERATION]'

const log = (step: string, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString()
  console.log(`${LOG_PREFIX} [${timestamp}] ${step}`)
  if (data) {
    console.log(`${LOG_PREFIX} └─ Data:`, JSON.stringify(data, null, 2))
  }
}

const logError = (step: string, error: unknown, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString()
  console.error(`${LOG_PREFIX} [${timestamp}] ❌ ERROR: ${step}`)
  if (error instanceof Error) {
    console.error(`${LOG_PREFIX} └─ Message: ${error.message}`)
    console.error(`${LOG_PREFIX} └─ Stack: ${error.stack}`)
  } else {
    console.error(`${LOG_PREFIX} └─ Error:`, error)
  }
  if (data) {
    console.error(`${LOG_PREFIX} └─ Context:`, JSON.stringify(data, null, 2))
  }
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

<output_verbosity_spec>
- Default: 600-900 words for the full blog post.
- Use clear section headers with emojis as specified below.
- Avoid long narrative paragraphs; prefer compact bullets and short sections.
- Do not rephrase the research findings unless it improves clarity.
</output_verbosity_spec>

<uncertainty_and_ambiguity>
- If information is not clearly stated in the paper, acknowledge this limitation.
- Never fabricate statistics, percentages, or study details not found in the source material.
- When uncertain about specific numbers, use qualifiers like "approximately" or "the study suggests".
</uncertainty_and_ambiguity>

## Writing Style Guidelines

1. **Title Format**: Start with an emoji, then a catchy question format that relates to a common problem or desire
   - Example: "🏃 Want to Run Faster? Try This Surprising Pre-Workout Snack"
   - Example: "💪 Struggling with Muscle Soreness? Science Has a Sweet Solution"

2. **Structure**: Use these section headers with emojis AND descriptive subtitles:
   - Every header MUST have a colon followed by a brief, engaging subtitle specific to the article
   - The subtitle should hint at the key point of that section
   - Examples:
     * ## 🚨 The Problem: Peanut Allergies Keep Rising
     * ## 🧪 The Study: Avoid Peanuts or Eat Them Early?
     * ## 📊 The Results: Huge Drop in Peanut Allergies
     * ## 🧠 Why It Works: Teaching the Body Tolerance
     * ## 👶 What This Means for Parents
     * ## ⚠️ A Few Caveats
     * ## ✅ Bottom Line
   - Required sections (choose appropriate emoji for the topic):
     * The Problem/The Question — use 🚨, 🔬, or ❓
     * The Study — use 🧪 or 📊
     * The Results — use 📊 or 📈
     * Why It Works/Why This Works — use 🧠
     * What This Means for You/Parents/Runners/etc. — use 🎯, 👶, 🏃, or topic-appropriate emoji
     * Caveats/Limitations — use ⚠️
     * Bottom Line — use ✅ or 💡

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
   - The Results: Follow these formatting rules carefully:
     * **Lead with the conclusion**, not the study name or author
     * Use emoji markers for visual scanning:
       - ✅ for positive/beneficial findings
       - ❌ for negative findings or risks
       - ⚖️ for neutral/no-difference findings
     * **One finding per line** — keep it scannable, no dense paragraphs
     * **Plain English first**, then supporting numbers
       - Good: "✅ **No increased choking risk** — only 2 out of 142 BLW babies choked vs 3 out of 138 TSF babies"
       - Bad: "In one trial (Smith et al.), 2 out of 142 BLW babies choked vs 3 out of 138 TSF babies (P > .20)"
     * Move study citations and P-values to the end of the bullet or omit them entirely
     * Avoid inline statistical notation (±, P < .001, g/dL) — translate to plain language
     * When comparing groups, make the contrast immediately clear:
       - Good: "14 out of 100 who avoided peanuts developed an allergy vs only 2 out of 100 who ate peanuts"
       - Bad: "The avoidance group had 13.7% incidence compared to 1.9% in the consumption group (P < .001)"
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
  console.log('\n' + '='.repeat(60))
  log('🚀 STARTING BLOG GENERATION')
  log('Input parameters', { paperId, paperTitle, vectorStoreId })
  console.log('='.repeat(60))

  const payload = await getPayload({ config })
  log('Step 1/8: Payload instance acquired')

  try {
    // Update status to generating
    log('Step 2/8: Updating paper status to "generating"')
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: { blogGenerationStatus: 'generating' },
      context: { skipOpenAIUpload: true },
    })
    log('Step 2/8: ✓ Paper status updated')

    // Check if paper already has a generated blog post
    log('Step 3/8: Checking for existing blog post')
    const paper = await payload.findByID({
      collection: 'papers',
      id: paperId,
    })
    log('Step 3/8: Paper fetched', {
      hasExistingBlogPost: !!paper.generatedBlogPost,
      existingBlogPostId: paper.generatedBlogPost || null,
    })

    if (paper.generatedBlogPost) {
      log('⚠️ Paper already has generated blog post - SKIPPING', { paperId })
      await payload.update({
        collection: 'papers',
        id: paperId,
        data: { blogGenerationStatus: 'skipped' },
        context: { skipOpenAIUpload: true },
      })
      console.log('='.repeat(60) + '\n')
      return
    }

    // Create a thread with the vector store attached
    log('Step 4/8: Creating OpenAI thread with vector store')
    log('Step 4/8: Vector store ID being used', { vectorStoreId })
    const thread = await openai.beta.threads.create({
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStoreId],
        },
      },
    })
    log('Step 4/8: ✓ Thread created', { threadId: thread.id })

    // Add the user message requesting blog generation
    log('Step 5/8: Adding user message to thread')
    const userMessageContent = `Please read and analyze the attached academic paper titled "${paperTitle}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

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
    log('Step 5/8: ✓ User message added', { messageLength: userMessageContent.length })

    // Get or create assistant
    log('Step 6/8: Getting/creating blog assistant')
    const assistantId = await getOrCreateBlogAssistant()
    log('Step 6/8: ✓ Assistant ready', { assistantId })

    // Run the assistant
    log('Step 6/8: Running assistant (this may take 30-60 seconds)...')
    const runStartTime = Date.now()
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistantId,
      tool_choice: { type: 'file_search' },
    })
    const runDuration = ((Date.now() - runStartTime) / 1000).toFixed(1)

    log('Step 6/8: Run completed', {
      status: run.status,
      durationSeconds: runDuration,
      runId: run.id,
      usage: run.usage,
    })

    if (run.status !== 'completed') {
      log('Step 6/8: ❌ Run did NOT complete successfully', {
        status: run.status,
        lastError: run.last_error,
        failedAt: run.failed_at,
        incompleteDetails: run.incomplete_details,
      })
      throw new Error(`Run failed with status: ${run.status}. Last error: ${JSON.stringify(run.last_error)}`)
    }

    // Get the generated content
    log('Step 7/8: Fetching assistant response')
    const messages = await openai.beta.threads.messages.list(thread.id)
    log('Step 7/8: Messages fetched', {
      totalMessages: messages.data.length,
      messageRoles: messages.data.map((m) => m.role),
    })

    const assistantMessage = messages.data.find((m) => m.role === 'assistant')

    if (!assistantMessage) {
      log('Step 7/8: ❌ No assistant message found in thread')
      throw new Error('No assistant message found in thread')
    }

    log('Step 7/8: Assistant message found', {
      contentBlocks: assistantMessage.content.length,
      contentTypes: assistantMessage.content.map((c) => c.type),
    })

    if (assistantMessage.content[0].type !== 'text') {
      log('Step 7/8: ❌ First content block is not text', {
        actualType: assistantMessage.content[0].type,
      })
      throw new Error(`Expected text response, got: ${assistantMessage.content[0].type}`)
    }

    const markdownContent = assistantMessage.content[0].text.value
    log('Step 7/8: ✓ Markdown content extracted', {
      contentLength: markdownContent.length,
      preview: markdownContent.slice(0, 200) + '...',
      hasAnnotations: assistantMessage.content[0].text.annotations?.length || 0,
    })

    // Extract title from markdown (first line starting with #)
    const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
    const blogTitle = titleMatch ? titleMatch[1].trim() : `Summary: ${paperTitle}`
    log('Step 7/8: Title extracted', {
      foundInMarkdown: !!titleMatch,
      extractedTitle: blogTitle,
    })

    // Generate slug from title
    const baseSlug = generateSlug(blogTitle)
    const timestamp = Date.now()
    const slug = `${baseSlug}-${timestamp}`
    log('Step 7/8: Slug generated', { baseSlug, timestamp, finalSlug: slug })

    // Convert markdown to Lexical format
    log('Step 7/8: Converting markdown to Lexical format')
    const lexicalContent = markdownToLexical(markdownContent)
    log('Step 7/8: ✓ Lexical conversion complete', {
      rootChildrenCount: lexicalContent.root.children.length,
      nodeTypes: lexicalContent.root.children.map((c) => c.type),
    })

    // Get admin user for author (first admin user)
    log('Step 8/8: Finding admin user for author')
    const adminUsers = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 1,
    })
    const authorId = adminUsers.docs[0]?.id
    log('Step 8/8: Admin user search result', {
      found: !!authorId,
      authorId: authorId || 'NOT FOUND',
      totalAdminUsers: adminUsers.totalDocs,
    })

    if (!authorId) {
      throw new Error('No admin user found to set as author. Please ensure at least one admin user exists.')
    }

    // Create the blog post
    log('Step 8/8: Creating blog post in database')
    const blogPostData = {
      title: blogTitle,
      slug,
      content: lexicalContent,
      excerpt: `AI-generated summary of the research paper: ${paperTitle}`,
      publishedDate: new Date().toISOString(),
      author: authorId,
      sourcePaper: paperId,
      status: 'draft' as const,
    }
    log('Step 8/8: Blog post data prepared', {
      title: blogPostData.title,
      slug: blogPostData.slug,
      excerptLength: blogPostData.excerpt.length,
      authorId: blogPostData.author,
      sourcePaperId: blogPostData.sourcePaper,
      status: blogPostData.status,
    })

    const blogPost = await payload.create({
      collection: 'blog-posts',
      data: blogPostData,
    })
    log('Step 8/8: ✓ Blog post created', { blogPostId: blogPost.id })

    // Update paper with the generated blog post reference
    log('Step 8/8: Linking blog post to paper')
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: {
        generatedBlogPost: blogPost.id,
        blogGenerationStatus: 'completed',
      },
      context: { skipOpenAIUpload: true },
    })
    log('Step 8/8: ✓ Paper updated with blog post reference')

    // Clean up thread
    log('Cleanup: Deleting OpenAI thread')
    await openai.beta.threads.delete(thread.id)
    log('Cleanup: ✓ Thread deleted')

    console.log('='.repeat(60))
    log('🎉 BLOG GENERATION COMPLETE!')
    log('Summary', {
      paperId,
      paperTitle,
      blogPostId: blogPost.id,
      blogTitle,
      slug,
      contentLength: markdownContent.length,
      lexicalNodes: lexicalContent.root.children.length,
    })
    console.log('='.repeat(60) + '\n')

  } catch (error) {
    console.log('='.repeat(60))
    logError('Blog generation failed', error, { paperId, paperTitle, vectorStoreId })
    console.log('='.repeat(60))

    try {
      log('Attempting to save error status to paper')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await payload.update({
        collection: 'papers',
        id: paperId,
        data: {
          blogGenerationStatus: 'error',
          blogGenerationError: errorMessage.slice(0, 500), // Limit error message length
        },
        context: { skipOpenAIUpload: true },
      })
      log('Error status saved to paper', { errorMessage: errorMessage.slice(0, 100) })
    } catch (updateError) {
      logError('Failed to save error status to paper', updateError, { paperId })
    }
    console.log('='.repeat(60) + '\n')
  }
}

/**
 * Get or create the blog generation assistant
 */
let cachedAssistantId: string | null = null

async function getOrCreateBlogAssistant(): Promise<string> {
  log('getOrCreateBlogAssistant: Checking for cached assistant')

  if (cachedAssistantId) {
    log('getOrCreateBlogAssistant: Using cached assistant ID', { assistantId: cachedAssistantId })
    return cachedAssistantId
  }

  const assistantName = 'Blog Post Generator'
  log('getOrCreateBlogAssistant: No cache, searching for existing assistant', { assistantName })

  // Check if assistant already exists
  const assistants = await openai.beta.assistants.list({ limit: 100 })
  log('getOrCreateBlogAssistant: Fetched assistants list', {
    totalAssistants: assistants.data.length,
    assistantNames: assistants.data.map((a) => a.name),
  })

  const existing = assistants.data.find((a) => a.name === assistantName)

  if (existing) {
    // Always update the assistant instructions to ensure they match the current prompt
    log('getOrCreateBlogAssistant: Found existing assistant, updating instructions', {
      assistantId: existing.id,
    })
    await openai.beta.assistants.update(existing.id, {
      instructions: BLOG_SYSTEM_PROMPT,
      model: 'gpt-5.2',
      temperature: 0.7,
    })
    cachedAssistantId = existing.id
    log('getOrCreateBlogAssistant: ✓ Assistant instructions updated', {
      assistantId: existing.id,
      model: existing.model,
      tools: existing.tools.map((t) => t.type),
    })
    return existing.id
  }

  // Create new assistant
  log('getOrCreateBlogAssistant: No existing assistant found, creating new one')
  log('getOrCreateBlogAssistant: System prompt length', {
    promptLength: BLOG_SYSTEM_PROMPT.length,
    promptPreview: BLOG_SYSTEM_PROMPT.slice(0, 100) + '...',
  })

  const assistant = await openai.beta.assistants.create({
    name: assistantName,
    instructions: BLOG_SYSTEM_PROMPT,
    model: 'gpt-5.2',
    tools: [{ type: 'file_search' }],
    temperature: 0.7, // Supported with reasoning effort 'none' (default for gpt-5.2)
  })

  cachedAssistantId = assistant.id
  log('getOrCreateBlogAssistant: ✓ Created new assistant', {
    assistantId: assistant.id,
    model: assistant.model,
    name: assistant.name,
  })
  return assistant.id
}
