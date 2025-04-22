// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import BlogPosts from './collections/BlogPosts'
import AboutMe from './app/(payload)/globals/aboutMe'
import Puzzles from './collections/puzzles'
import MixAndMatchPuzzles from './collections/mixandmatchpuzzles'
import OneOffPuzzles from './collections/oneoffpuzzles'

import { generateOneoffsHandler } from './utils/generateOneoffsHandler'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, BlogPosts, Puzzles, MixAndMatchPuzzles, OneOffPuzzles],
  globals: [AboutMe],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // storage-adapter-placeholder
  ],
  endpoints: [
    {
      path: '/generate-oneoffs',
      method: 'post',
      handler: generateOneoffsHandler,
    },
  ],
})
