import { z } from 'zod'
import { bootstrapProviders } from '@/lib/providers'
import { getProvider } from '@/lib/providers/registry'
import { GenerateInputSchema } from '@/lib/providers/types'
import { resolveSize } from '@/lib/providers/size-catalog'
import { sseResponse } from '@/lib/sse/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

bootstrapProviders()

const BodySchema = z.object({
  providerId: z.string().min(1),
  input: GenerateInputSchema,
})

export async function POST(req: Request): Promise<Response> {
  const apiKey = req.headers.get('x-api-key') ?? ''
  if (!apiKey) return new Response(JSON.stringify({ error: 'missing api key' }), { status: 401 })
  let json: unknown
  try { json = await req.json() } catch { return new Response('bad json', { status: 400 }) }
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 })
  let adapter
  try { adapter = getProvider(parsed.data.providerId) }
  catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 }) }

  const ac = new AbortController()
  req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  const desiredSize = parsed.data.input.size ?? adapter.capabilities.sizes[0]
  const resolvedInput = { ...parsed.data.input, size: resolveSize(desiredSize, adapter.capabilities.sizes) }
  return sseResponse(adapter.generate(resolvedInput, apiKey, ac.signal), ac.signal)
}
