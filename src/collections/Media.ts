import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/isAdmin'
import { isAdminUIOnly } from '../access/isAdminUIOnly'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: isAdmin,
    delete: isAdmin,
    admin: isAdminUIOnly,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
}
