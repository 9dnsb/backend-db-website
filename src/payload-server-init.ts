import payload from 'payload'
import path from 'path'
import type { InitOptions } from 'payload'

export async function initPayload() {
  const secret = process.env.PAYLOAD_SECRET

  if (!secret) {
    throw new Error('❌ PAYLOAD_SECRET is missing.')
  }

  await payload.init({
    secret, // ✅ Top-level
    config: path.resolve(__dirname, '../../../../../payload.config.ts'),
    serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  } as unknown as InitOptions)
}
