// aboutMe.ts
import { GlobalConfig } from 'payload'

const AboutMe: GlobalConfig = {
  slug: 'about-me',
  label: 'About Me',
  fields: [
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
  ],
  access: {
    read: () => true, // ✅ allow public read access
  },
}

export default AboutMe
