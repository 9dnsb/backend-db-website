import { isAdmin } from '@/access/isAdmin'
import { isAdminUIOnly } from '@/access/isAdminUIOnly'
import { isSelfOrAdmin } from '@/access/isSelfOrAdmin'
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
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'User', value: 'user' },
      ],
      defaultValue: 'user',
      required: true,
      access: {
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
  access: {
    read: isSelfOrAdmin,
    create: () => true,
    update: isSelfOrAdmin,
    delete: isAdmin,
    admin: isAdminUIOnly,
  },

  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && !req.user) {
          data.role = 'user' // force new users to be "user" if unauthenticated
        }
        return data
      },
    ],
    afterLogin: [logSuccessfulLogin], // ✅ Goes here
  },
}
