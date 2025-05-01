import { adminOnlyAccess } from '@/access/adminOnlyAccess'
import type { CollectionConfig } from 'payload'

const OneOffPuzzles: CollectionConfig = {
  slug: 'oneoffpuzzles',
  admin: {
    useAsTitle: 'slug',
  },
  access: adminOnlyAccess,
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.publishedDate && !data.slug) {
          const date = new Date(data.publishedDate)
          data.slug = date.toISOString().slice(0, 10)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'publishedDate',
      type: 'date',
      label: 'Published Date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'generateFromApi',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: '@/components/fields/GenerateFromApiButton',
        },
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'startingWord',
      type: 'text',
      required: true,
    },
    {
      name: 'validAnswers',
      type: 'array',
      label: 'Valid One-Off Answers',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'word',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}

export default OneOffPuzzles
