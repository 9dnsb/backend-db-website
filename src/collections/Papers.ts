import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/isAdmin'
import { isAdminUIOnly } from '../access/isAdminUIOnly'
import { uploadToOpenAI } from '../hooks/uploadToOpenAI'
import { deleteFromOpenAI } from '../hooks/deleteFromOpenAI'

export const Papers: CollectionConfig = {
  slug: 'papers',
  admin: {
    useAsTitle: 'title',
    description: 'Academic papers for blog post AI chat',
    defaultColumns: ['title', 'processingStatus', 'createdAt'],
  },
  access: {
    read: () => true,
    create: ({ req }) => !!req.user,
    update: isAdmin,
    delete: isAdmin,
    admin: isAdminUIOnly,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Paper Title',
      admin: {
        description: 'Title of the academic paper',
      },
    },
    {
      name: 'processingStatus',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Ready', value: 'ready' },
        { label: 'Error', value: 'error' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: {
          Field: '@/components/fields/ProcessingStatus',
        },
      },
    },
    {
      name: 'openaiFileId',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-populated after upload',
        condition: (data) => !!data?.openaiFileId,
      },
    },
    {
      name: 'vectorStoreId',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-populated after processing',
        condition: (data) => !!data?.vectorStoreId,
      },
    },
    {
      name: 'errorMessage',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => data?.processingStatus === 'error',
      },
    },
  ],
  upload: {
    mimeTypes: ['application/pdf'],
  },
  hooks: {
    afterChange: [uploadToOpenAI],
    beforeDelete: [deleteFromOpenAI],
  },
}
