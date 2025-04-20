import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    cookies: {
      sameSite: 'None',
      secure: true,
    },
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
