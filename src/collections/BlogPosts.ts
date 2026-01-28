import type { CollectionConfig } from 'payload'
import {
  lexicalEditor,
  FixedToolbarFeature,
  LinkFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'

import { isAdminUIOnly } from '../access/isAdminUIOnly'
import { verifyOwnershipOrAdmin } from '@/access/verifyOwnershipOrAdmin'

const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedDate'],
  },
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: verifyOwnershipOrAdmin,
    delete: verifyOwnershipOrAdmin,
    admin: isAdminUIOnly,
  },

  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      defaultValue: ({ user }) => user?.id,
      admin: {
        condition: () => false,
      },
    },

    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        components: {
          Field: '@/components/fields/TestField.tsx',
        },
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          FixedToolbarFeature(), // 👈 add this first for best layout
          ...defaultFeatures,
          LinkFeature({
            fields: ({ defaultFields }) => [
              ...defaultFields,
              {
                name: 'rel',
                label: 'Rel Attribute',
                type: 'select',
                hasMany: true,
                options: ['noopener', 'noreferrer', 'nofollow'],
              },
            ],
          }),
          UploadFeature({
            collections: {
              uploads: {
                fields: [
                  {
                    name: 'caption',
                    type: 'text',
                  },
                ],
              },
            },
          }),
        ],
      }),
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'publishedDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date(),
      admin: {
        placeholder: 'Select a publish date',
        date: {
          displayFormat: 'd MMM yyyy',
          pickerAppearance: 'dayOnly',
        },
      },
    },

    {
      name: 'tags',
      type: 'array',
      fields: [
        {
          name: 'tag',
          type: 'text',
        },
      ],
    },
    {
      name: 'sourcePaper',
      type: 'relationship',
      relationTo: 'papers',
      label: 'Source Paper (PDF)',
      admin: {
        description: 'Link an academic paper to enable AI-powered Q&A on this post',
      },
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user) {
          data.author = req.user.id
        }
        return data
      },
    ],
  },
}

export default BlogPosts
