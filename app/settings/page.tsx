import { KeyManager } from '@/components/settings/KeyManager'
export default function SettingsPage() {
  return (
    <main className="p-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">API Keys</h1>
      <p className="text-sm text-muted-foreground">Keys are stored locally in your browser and sent only at request time.</p>
      <KeyManager />
    </main>
  )
}
