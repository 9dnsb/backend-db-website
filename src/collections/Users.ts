import { logSuccessfulLogin } from '@/hooks/logSuccessfulLogin'
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    maxLoginAttempts: 5, // After 5 failed attempts...
    lockTime: 60 * 60 * 1000, // ... lock account for 1 hour (in ms)
    cookies: {
      sameSite: 'None',
      secure: true,
    },
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  hooks: {
    afterLogin: [logSuccessfulLogin], // ✅ Goes here
  },
}
