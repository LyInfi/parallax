import './globals.css'
import { Geist, Geist_Mono } from 'next/font/google'
import { Nav } from '@/components/Nav'
import { QueryProvider } from '@/components/QueryProvider'
import { Toaster } from '@/components/ui/sonner'
import { LocaleHtmlLang } from '@/components/LocaleHtmlLang'
import { UpdateNotifier } from '@/components/UpdateNotifier'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata = {
  title: 'Parallax',
  description: 'Multi-model image generation workbench — compare side-by-side.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        <QueryProvider>
          <LocaleHtmlLang />
          <Nav />
          {children}
          <UpdateNotifier />
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
