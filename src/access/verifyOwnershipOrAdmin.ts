import type { Access } from 'payload'

export const verifyOwnershipOrAdmin: Access = async ({ req, id }) => {
  if (!req.user || typeof id !== 'string') return false

  // Allow admins
  if (req.user.role === 'admin') return true

  // Look up the blog post
  const post = await req.payload.findByID({
    collection: 'blog-posts',
    id,
  })

  // Check if the logged-in user is the author
  return post.author === req.user.id
}
