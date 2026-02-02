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
 * Using GPT-5.2 best practices with verbosity and uncertainty handling
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

Example Results section:
## 📈 The Results: No Major Safety Differences

✅ **No increased choking risk** — 2 out of 142 BLW babies choked vs 3 out of 138 spoon-fed babies

⚖️ **Mixed findings on weight** — one study found 0% of BLW babies overweight vs 17% spoon-fed; another study found no difference

✅ **Iron levels were identical** — both groups had similar hemoglobin levels around 12 grams per deciliter

---

## Writing Style Guidelines

1. **Title Format**: Start with an emoji, then a catchy question format
   - Example: "🏃 Want to Run Faster? Try This Surprising Pre-Workout Snack"
   - Example: "💪 Struggling with Muscle Soreness? Science Has a Sweet Solution"

2. **Required Sections** (all must have descriptive subtitles):
   - ## 🚨/🔬/❓ The Problem/Question: [Subtitle]
   - ## 🧪/📊 The Study: [Subtitle]
   - ## 📊/📈 The Results: [Subtitle]
   - ## 🧠 Why It Works: [Subtitle]
   - ## 🎯/👶/🏃 What This Means for You/Parents/etc: [Subtitle]
   - ## ⚠️ Caveats/Limitations
   - ## ✅/💡 Bottom Line

3. **Tone**: Conversational, accessible, use "you" directly, avoid jargon

4. **Formatting**:
   - Use **bold** for key findings
   - Use horizontal rules (---) between sections
   - Keep paragraphs short (2-4 sentences)

5. **Length**: 600-900 words total

<uncertainty_and_ambiguity>
- If information is not clearly stated in the paper, acknowledge this limitation.
- Never fabricate statistics, percentages, or study details not found in the source material.
- When uncertain about specific numbers, use qualifiers like "approximately" or "the study suggests".
</uncertainty_and_ambiguity>

## Output Format
Return ONLY the markdown content. Start directly with the emoji title (e.g., "# 🏃 Want to Run Faster?...")`

/**
 * Generate a blog post from a paper using OpenAI Responses API (GPT-5.2)
 */
export async function generateBlogFromPaper(
  paperId: string,
  paperTitle: string,
  vectorStoreId: string
): Promise<void> {
  console.log('\n' + '='.repeat(60))
  log('🚀 STARTING BLOG GENERATION (Responses API + GPT-5.2)')
  log('Input parameters', { paperId, paperTitle, vectorStoreId })
  console.log('='.repeat(60))

  const payload = await getPayload({ config })
  log('Step 1/6: Payload instance acquired')

  try {
    // Update status to generating
    log('Step 2/6: Updating paper status to "generating"')
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: { blogGenerationStatus: 'generating' },
      context: { skipOpenAIUpload: true },
    })
    log('Step 2/6: ✓ Paper status updated')

    // Check if paper already has a generated blog post
    log('Step 3/6: Checking for existing blog post')
    const paper = await payload.findByID({
      collection: 'papers',
      id: paperId,
    })
    log('Step 3/6: Paper fetched', {
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

    // Generate blog using Responses API with file_search tool
    log('Step 4/6: Calling OpenAI Responses API with GPT-5.2')
    const userMessage = `Please read and analyze the attached academic paper titled "${paperTitle}" using the file_search tool. Then write a blog post about it following the style guidelines in your instructions.

Focus on:
1. The main research question and why it matters
2. The methodology and participants
3. The key findings with specific numbers
4. The practical implications for readers

Remember to use the exact section structure and emoji headers specified in your instructions.`

    log('Step 4/6: User message prepared', { messageLength: userMessage.length })

    const runStartTime = Date.now()
    const response = await openai.responses.create({
      model: 'gpt-5.2',
      instructions: BLOG_SYSTEM_PROMPT,
      input: [{ role: 'user', content: userMessage }],
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [vectorStoreId],
        },
      ],
      // GPT-5.2 specific settings
      reasoning: {
        effort: 'low', // Use some reasoning for better blog quality
      },
      text: {
        verbosity: 'medium', // Balanced output length
      },
      max_output_tokens: 4096,
    })
    const runDuration = ((Date.now() - runStartTime) / 1000).toFixed(1)

    log('Step 4/6: Response received', {
      status: response.status,
      durationSeconds: runDuration,
      responseId: response.id,
      usage: response.usage,
    })

    if (response.status !== 'completed') {
      log('Step 4/6: ❌ Response did NOT complete successfully', {
        status: response.status,
        error: response.error,
        incompleteDetails: response.incomplete_details,
      })
      throw new Error(`Response failed with status: ${response.status}. Error: ${JSON.stringify(response.error)}`)
    }

    // Extract the generated content from the response
    log('Step 5/6: Extracting generated content')
    const markdownContent = response.output_text

    if (!markdownContent) {
      log('Step 5/6: ❌ No text content in response')
      throw new Error('No text content in response output')
    }

    log('Step 5/6: ✓ Markdown content extracted', {
      contentLength: markdownContent.length,
      preview: markdownContent.slice(0, 200) + '...',
    })

    // Extract title from markdown (first line starting with #)
    const titleMatch = markdownContent.match(/^#\s+(.+)$/m)
    const blogTitle = titleMatch ? titleMatch[1].trim() : `Summary: ${paperTitle}`
    log('Step 5/6: Title extracted', {
      foundInMarkdown: !!titleMatch,
      extractedTitle: blogTitle,
    })

    // Generate slug from title
    const baseSlug = generateSlug(blogTitle)
    const timestamp = Date.now()
    const slug = `${baseSlug}-${timestamp}`
    log('Step 5/6: Slug generated', { baseSlug, timestamp, finalSlug: slug })

    // Convert markdown to Lexical format
    log('Step 5/6: Converting markdown to Lexical format')
    const lexicalContent = markdownToLexical(markdownContent)
    log('Step 5/6: ✓ Lexical conversion complete', {
      rootChildrenCount: lexicalContent.root.children.length,
      nodeTypes: lexicalContent.root.children.map((c) => c.type),
    })

    // Get admin user for author (first admin user)
    log('Step 6/6: Finding admin user for author')
    const adminUsers = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 1,
    })
    const authorId = adminUsers.docs[0]?.id
    log('Step 6/6: Admin user search result', {
      found: !!authorId,
      authorId: authorId || 'NOT FOUND',
      totalAdminUsers: adminUsers.totalDocs,
    })

    if (!authorId) {
      throw new Error('No admin user found to set as author. Please ensure at least one admin user exists.')
    }

    // Create the blog post
    log('Step 6/6: Creating blog post in database')
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
    log('Step 6/6: Blog post data prepared', {
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
    log('Step 6/6: ✓ Blog post created', { blogPostId: blogPost.id })

    // Update paper with the generated blog post reference
    log('Step 6/6: Linking blog post to paper')
    await payload.update({
      collection: 'papers',
      id: paperId,
      data: {
        generatedBlogPost: blogPost.id,
        blogGenerationStatus: 'completed',
      },
      context: { skipOpenAIUpload: true },
    })
    log('Step 6/6: ✓ Paper updated with blog post reference')

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
      model: 'gpt-5.2',
      api: 'Responses API',
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
