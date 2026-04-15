import { registerProvider, clearRegistry } from './registry'
import { mockProvider } from './mock'
import { openrouterProvider } from './openrouter'
import { googleNanoBanana2Provider } from './google-nano-banana-2'
import { doubaoSeedreamProvider } from './doubao-seedream'
import { jimengSeedreamProvider } from './jimeng-seedream'
import { wanxiangProvider } from './wanxiang'
import { hunyuanProvider } from './hunyuan'

let bootstrapped = false
export function bootstrapProviders(): void {
  if (bootstrapped) return
  clearRegistry()
  registerProvider(mockProvider)
  registerProvider(openrouterProvider)
  registerProvider(googleNanoBanana2Provider)
  registerProvider(doubaoSeedreamProvider)
  registerProvider(jimengSeedreamProvider)
  registerProvider(wanxiangProvider)
  registerProvider(hunyuanProvider)
  bootstrapped = true
}
