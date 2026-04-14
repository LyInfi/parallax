import { registerProvider, clearRegistry } from './registry'
import { mockProvider } from './mock'

let bootstrapped = false
export function bootstrapProviders(): void {
  if (bootstrapped) return
  clearRegistry()
  registerProvider(mockProvider)
  bootstrapped = true
}
