import type { CollectionAfterLoginHook } from 'payload'

export const logSuccessfulLogin: CollectionAfterLoginHook = async ({
  user,
  req,
  collection,
  token, // ✅ correct name for TS
}) => {
  void token

  req.payload.logger.info(`[LOGIN] User ${user.email} logged in to ${collection.slug}`)
}
