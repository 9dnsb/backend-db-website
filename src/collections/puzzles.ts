import { adminOnlyAccess } from '@/access/adminOnlyAccess'

import type { CollectionConfig, Field } from 'payload'

const defaultGroup = Array.from({ length: 4 }, () => ({ word: '' }))

const difficultyGroupFields: Field[] = [
  {
    name: 'label',
    type: 'text',
    required: true,
  },
  {
    name: 'words',
    type: 'array',
    required: true,
    minRows: 4,
    maxRows: 4,
    defaultValue: defaultGroup,
    fields: [
      {
        name: 'word',
        type: 'text',
        required: true,
      },
    ],
  },
]

const Puzzles: CollectionConfig = {
  slug: 'puzzles',
  admin: {
    useAsTitle: 'slug',
  },
  access: adminOnlyAccess,
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.publishedDate) {
          const date = new Date(data.publishedDate)
          const formatted = date.toISOString().slice(0, 10)
          data.slug = formatted
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
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },

    {
      name: 'easyGroup',
      label: 'Easy Group',
      type: 'group',
      fields: difficultyGroupFields,
    },
    {
      name: 'mediumGroup',
      label: 'Medium Group',
      type: 'group',
      fields: difficultyGroupFields,
    },
    {
      name: 'hardGroup',
      label: 'Hard Group',
      type: 'group',
      fields: difficultyGroupFields,
    },
    {
      name: 'trickyGroup',
      label: 'Tricky Group',
      type: 'group',
      fields: difficultyGroupFields,
    },
  ],
}

export default Puzzles
