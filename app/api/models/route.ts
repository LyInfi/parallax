import { bootstrapProviders } from '@/lib/providers'
import { listProviders } from '@/lib/providers/registry'

export const runtime = 'nodejs'
bootstrapProviders()

export async function GET() {
  const providers = listProviders().map(p => ({
    id: p.id,
    displayName: p.displayName,
    capabilities: p.capabilities,
  }))
  return Response.json({ providers })
}
