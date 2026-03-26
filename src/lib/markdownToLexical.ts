/**
 * Converts markdown text to Payload's Lexical editor format.
 * Supports: headings, paragraphs, bold, italic, links, lists, blockquotes, horizontal rules
 */

const LOG_PREFIX = '[MARKDOWN->LEXICAL]'
const DEBUG = process.env.NODE_ENV !== 'production' // Set to false to reduce log verbosity

const log = (message: string, data?: Record<string, unknown>) => {
  if (!DEBUG) return
  console.log(`${LOG_PREFIX} ${message}`)
  if (data) {
    console.log(`${LOG_PREFIX} └─`, JSON.stringify(data, null, 2))
  }
}

type LexicalNode = {
  type: string
  version: number
  [key: string]: unknown
}

type TextNode = LexicalNode & {
  type: 'text'
  text: string
  format: number
  detail: number
  mode: string
  style: string
}

type LinkNode = LexicalNode & {
  type: 'link'
  children: LexicalNode[]
  fields: {
    url: string
    newTab: boolean
    linkType: 'custom'
  }
}

type ParagraphNode = LexicalNode & {
  type: 'paragraph'
  children: LexicalNode[]
  direction: 'ltr' | null
  format: string
  indent: number
  textFormat: number
  textStyle: string
}

type HeadingNode = LexicalNode & {
  type: 'heading'
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  children: LexicalNode[]
  direction: 'ltr' | null
  format: string
  indent: number
}

type ListNode = LexicalNode & {
  type: 'list'
  listType: 'bullet' | 'number'
  children: LexicalNode[]
  direction: 'ltr' | null
  format: string
  indent: number
  start: number
  tag: 'ul' | 'ol'
}

type _ListItemNode = LexicalNode & {
  type: 'listitem'
  children: LexicalNode[]
  direction: 'ltr' | null
  format: string
  indent: number
  value: number
}

type QuoteNode = LexicalNode & {
  type: 'quote'
  children: LexicalNode[]
  direction: 'ltr' | null
  format: string
  indent: number
}

type HorizontalRuleNode = LexicalNode & {
  type: 'horizontalrule'
}

// Text format flags (can be combined with bitwise OR)
const TEXT_FORMAT = {
  BOLD: 1,
  ITALIC: 2,
  STRIKETHROUGH: 4,
  UNDERLINE: 8,
  CODE: 16,
}

function createTextNode(text: string, format: number = 0): TextNode {
  return {
    type: 'text',
    version: 1,
    text,
    format,
    detail: 0,
    mode: 'normal',
    style: '',
  }
}

function createLinkNode(text: string, url: string): LinkNode {
  return {
    type: 'link',
    version: 3,
    children: [createTextNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    fields: {
      url,
      newTab: false,
      linkType: 'custom',
    },
  }
}

function createParagraphNode(children: LexicalNode[]): ParagraphNode {
  return {
    type: 'paragraph',
    version: 1,
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
  }
}

function createHeadingNode(
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  children: LexicalNode[]
): HeadingNode {
  return {
    type: 'heading',
    version: 1,
    tag,
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
  }
}

function createListNode(
  listType: 'bullet' | 'number',
  items: LexicalNode[][]
): ListNode {
  return {
    type: 'list',
    version: 1,
    listType,
    tag: listType === 'bullet' ? 'ul' : 'ol',
    children: items.map((itemChildren, index) => ({
      type: 'listitem',
      version: 1,
      children: itemChildren,
      direction: 'ltr',
      format: '',
      indent: 0,
      value: index + 1,
    })),
    direction: 'ltr',
    format: '',
    indent: 0,
    start: 1,
  }
}

function createQuoteNode(children: LexicalNode[]): QuoteNode {
  return {
    type: 'quote',
    version: 1,
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
  }
}

function createHorizontalRuleNode(): HorizontalRuleNode {
  return {
    type: 'horizontalrule',
    version: 1,
  }
}

/**
 * Parse inline formatting in text (bold, italic, links)
 */
function parseInlineFormatting(text: string): LexicalNode[] {
  const nodes: LexicalNode[] = []

  // Regex patterns for inline formatting
  // Order matters: process more complex patterns first
  const patterns = [
    // Links: [text](url)
    {
      regex: /\[([^\]]+)\]\(([^)]+)\)/g,
      handler: (match: RegExpMatchArray) => createLinkNode(match[1], match[2]),
    },
    // Bold + Italic: ***text*** or ___text___
    {
      regex: /(\*\*\*|___)(.+?)\1/g,
      handler: (match: RegExpMatchArray) =>
        createTextNode(match[2], TEXT_FORMAT.BOLD | TEXT_FORMAT.ITALIC),
    },
    // Bold: **text** or __text__
    {
      regex: /(\*\*|__)(.+?)\1/g,
      handler: (match: RegExpMatchArray) =>
        createTextNode(match[2], TEXT_FORMAT.BOLD),
    },
    // Italic: *text* or _text_
    {
      regex: /(\*|_)(.+?)\1/g,
      handler: (match: RegExpMatchArray) =>
        createTextNode(match[2], TEXT_FORMAT.ITALIC),
    },
  ]

  let lastIndex = 0

  // Find all matches and their positions
  interface MatchInfo {
    index: number
    length: number
    node: LexicalNode
  }

  const allMatches: MatchInfo[] = []

  for (const { regex, handler } of patterns) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      // Check if this position overlaps with existing matches
      const overlaps = allMatches.some(
        (m) =>
          (match!.index >= m.index && match!.index < m.index + m.length) ||
          (m.index >= match!.index && m.index < match!.index + match![0].length)
      )
      if (!overlaps) {
        allMatches.push({
          index: match.index,
          length: match[0].length,
          node: handler(match),
        })
      }
    }
  }

  // Sort matches by position
  allMatches.sort((a, b) => a.index - b.index)

  // Build nodes array
  for (const match of allMatches) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index)
      if (plainText) {
        nodes.push(createTextNode(plainText))
      }
    }
    nodes.push(match.node)
    lastIndex = match.index + match.length
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    const plainText = text.slice(lastIndex)
    if (plainText) {
      nodes.push(createTextNode(plainText))
    }
  }

  // If no formatting found, return the whole text as a single node
  if (nodes.length === 0 && text) {
    nodes.push(createTextNode(text))
  }

  return nodes
}

type LexicalFormat = '' | 'left' | 'start' | 'center' | 'right' | 'end' | 'justify'

/**
 * Convert markdown string to Lexical editor state
 */
export function markdownToLexical(markdown: string): {
  root: {
    type: string
    version: number
    children: LexicalNode[]
    direction: 'ltr' | 'rtl' | null
    format: LexicalFormat
    indent: number
  }
} {
  console.log(`${LOG_PREFIX} Starting markdown conversion`)
  console.log(`${LOG_PREFIX} Input length: ${markdown.length} characters`)

  const lines = markdown.split('\n')
  console.log(`${LOG_PREFIX} Total lines: ${lines.length}`)

  const children: LexicalNode[] = []
  const stats = {
    headings: 0,
    paragraphs: 0,
    lists: 0,
    blockquotes: 0,
    horizontalRules: 0,
    emptyLines: 0,
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Skip empty lines
    if (!trimmedLine) {
      stats.emptyLines++
      i++
      continue
    }

    // Horizontal rule: ---, ***, ___
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
      log(`Line ${i + 1}: Horizontal rule`)
      children.push(createHorizontalRuleNode())
      stats.horizontalRules++
      i++
      continue
    }

    // Headings: # ## ### etc
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const headingText = headingMatch[2]
      const tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      log(`Line ${i + 1}: Heading ${tag}`, { text: headingText.slice(0, 50) })
      children.push(createHeadingNode(tag, parseInlineFormatting(headingText)))
      stats.headings++
      i++
      continue
    }

    // Blockquote: > text
    if (trimmedLine.startsWith('>')) {
      const quoteLines: string[] = []
      const startLine = i + 1
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const quoteText = quoteLines.join(' ')
      log(`Lines ${startLine}-${i}: Blockquote`, { lines: quoteLines.length, preview: quoteText.slice(0, 50) })
      children.push(createQuoteNode(parseInlineFormatting(quoteText)))
      stats.blockquotes++
      continue
    }

    // Unordered list: - item or * item
    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems: LexicalNode[][] = []
      const startLine = i + 1
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '')
        listItems.push(parseInlineFormatting(itemText))
        i++
      }
      log(`Lines ${startLine}-${i}: Unordered list`, { items: listItems.length })
      children.push(createListNode('bullet', listItems))
      stats.lists++
      continue
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: LexicalNode[][] = []
      const startLine = i + 1
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '')
        listItems.push(parseInlineFormatting(itemText))
        i++
      }
      log(`Lines ${startLine}-${i}: Ordered list`, { items: listItems.length })
      children.push(createListNode('number', listItems))
      stats.lists++
      continue
    }

    // Regular paragraph
    const paragraphLines: string[] = []
    const startLine = i + 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim())
      i++
    }
    if (paragraphLines.length > 0) {
      const paragraphText = paragraphLines.join(' ')
      log(`Lines ${startLine}-${i}: Paragraph`, { lines: paragraphLines.length, preview: paragraphText.slice(0, 50) })
      children.push(createParagraphNode(parseInlineFormatting(paragraphText)))
      stats.paragraphs++
    }
  }

  console.log(`${LOG_PREFIX} ✓ Conversion complete`)
  console.log(`${LOG_PREFIX} Stats:`, JSON.stringify(stats))
  console.log(`${LOG_PREFIX} Total Lexical nodes: ${children.length}`)
  console.log(`${LOG_PREFIX} Node types:`, children.map((c) => c.type).join(', '))

  return {
    root: {
      type: 'root',
      version: 1,
      children,
      direction: 'ltr',
      format: '' as LexicalFormat,
      indent: 0,
    },
  }
}
