import type { CollectionConfig } from 'payload'
import {
  lexicalEditor,
  FixedToolbarFeature,
  LinkFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'

const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedDate'],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
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
      name: 'author',
      type: 'relationship',
      relationTo: 'users', // Connected to your Users collection
      required: true,
      defaultValue: ({ user }) => user?.id,
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
  ],
  timestamps: true,
}

export default BlogPosts
