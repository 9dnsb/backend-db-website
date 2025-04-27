import payload from 'payload'

export async function GET() {
  await payload.jobs.queue({
    task: 'createOneOffPuzzle',
    input: {},
  })

  return new Response('✅ Queued createOneOffPuzzle job')
}
