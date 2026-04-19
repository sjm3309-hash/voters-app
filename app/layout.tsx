import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { BankruptcyModal } from "@/components/BankruptcyModal"
import { DailyRewardTrigger } from "@/components/daily-reward-trigger"
import { Toaster } from "@/components/ui/sonner"
import './globals.css'

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'VOTERS - Prediction Markets',
  description: 'Trade on the outcomes of real-world events. Crypto, stocks, politics, sports and more.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground transition-colors duration-300 ease-in-out overflow-x-hidden">
      <ThemeProvider
  attribute="class"
  defaultTheme="light"
  enableSystem
  disableTransitionOnChange={false}
>
          {children}
          <Toaster richColors closeButton position="top-center" />
          <BankruptcyModal />
          <DailyRewardTrigger />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {/* Google AdSense — NEXT_PUBLIC_ADSENSE_CLIENT 설정 시 자동 활성화 */}
        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  )
}
