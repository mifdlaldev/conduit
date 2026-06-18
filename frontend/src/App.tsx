import { useState, useRef } from 'react'
import { Download, Loader2, Github, ArrowRight, Zap, Shield, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import axios from 'axios'

type ExtractResponse = {
  downloadUrl?: string
  directDownloadUrl?: string | null
  proxyDownloadUrl?: string
  title?: string
  provider?: string
  deliveryMethod?: 'direct' | 'proxy'
}

type ProviderStatus = 'direct' | 'full'

const PROVIDERS: { domain: string; name: string; status: ProviderStatus }[] = [
  { domain: 'videy.co', name: 'Videy', status: 'direct' },
  { domain: 'videqs.download', name: 'Videqs', status: 'full' },
  { domain: 'playvvip.top', name: 'PlayVVIP', status: 'full' },
  { domain: 'fwh.is', name: 'FWH', status: 'full' },
]

const STATUS_CONFIG: Record<ProviderStatus, { label: string; class: string }> = {
  direct: { label: 'Direct', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  full: { label: 'Full Backend', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
}

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExtractResponse & { error?: string } | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    setResult(null)

    try {
      const response = await axios.post('/api/v1/extract', { url }, { timeout: 30000 })
      setResult({
        downloadUrl: response.data.data.downloadUrl,
        directDownloadUrl: response.data.data.directDownloadUrl,
        proxyDownloadUrl: response.data.data.proxyDownloadUrl,
        title: response.data.data.title,
        provider: response.data.data.provider,
        deliveryMethod: response.data.data.deliveryMethod,
      })
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: unknown } }; message?: string }
      const errorPayload = axiosErr.response?.data?.error
      const message =
        typeof errorPayload === 'string'
          ? errorPayload
          : errorPayload
            ? JSON.stringify(errorPayload)
            : axiosErr.message || 'An error occurred during extraction'

      setResult({ error: message })
    } finally {
      setLoading(false)
    }
  }

  const actionUrl = result?.directDownloadUrl || result?.proxyDownloadUrl
  const isDirectResult = result?.deliveryMethod === 'direct'
  const isProviderNeedsBackend = result?.error?.includes('requires a full backend')

  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-[120px]" />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full bg-sky-500/3 blur-[100px]" />
      </div>

      <div className="z-10 w-full max-w-md space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center mb-5">
            <div className="relative">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 p-3 shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
                <svg viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                  <path d="M30 90 L60 90 Q75 90 75 75 L75 60 Q75 50 85 50 L95 50 Q105 50 105 60 L105 75 Q105 90 120 90 L150 90"
                        stroke="white" strokeWidth="12" strokeLinecap="round" fill="none"/>
                  <path d="M140 78 L158 90 L140 102" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-500/20 to-transparent blur-sm -z-10" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
            Conduit
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base max-w-sm mx-auto leading-relaxed">
            Extract direct video sources from popular video hosting platforms
          </p>
        </div>

        {/* Provider Status */}
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((provider) => {
            const cfg = STATUS_CONFIG[provider.status]
            return (
              <div
                key={provider.domain}
                className={`px-3 py-2.5 rounded-xl border text-xs sm:text-sm ${cfg.class} flex items-center justify-between transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <span className="font-medium">{provider.name}</span>
                <span className="opacity-80 text-[11px] tracking-wide">{cfg.label}</span>
              </div>
            )
          })}
        </div>

        {/* Main Card */}
        <Card className="bg-neutral-900/60 border-neutral-800/50 backdrop-blur-xl shadow-2xl shadow-black/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-neutral-200 text-lg flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              Extract Video
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDownload} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="video-url" className="sr-only">Video URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                  <Input
                    id="video-url"
                    type="url"
                    placeholder="Paste video URL..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="bg-neutral-950/70 border-neutral-800 focus-visible:ring-blue-500/50 text-neutral-200 placeholder:text-neutral-600 pl-10 h-11"
                    required
                  />
                </div>
                <p className="text-[11px] text-neutral-600 px-1">
                  Try: <code className="text-neutral-500 bg-neutral-800/50 px-1.5 py-0.5 rounded text-[10px]">https://videy.co/v?id=...</code>
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !url}
                className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting Stream
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Get Download Link
                  </>
                )}
              </Button>
            </form>

            {/* Loading Skeleton */}
            {loading && (
              <div className="mt-6 space-y-3 animate-pulse" role="status" aria-label="Loading">
                <div className="h-4 bg-neutral-800 rounded-lg w-3/4 mx-auto" />
                <div className="h-3 bg-neutral-800 rounded-lg w-1/2 mx-auto" />
                <div className="h-10 bg-neutral-800 rounded-lg w-full" />
                <span className="sr-only">Extracting video stream...</span>
              </div>
            )}

            {/* Error State */}
            {result?.error && !loading && (
              <div ref={resultRef} className="mt-6 space-y-3">
                {isProviderNeedsBackend ? (
                  <div className="p-4 sm:p-5 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-xl space-y-3">
                    <p className="text-amber-300 font-medium text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Full Backend Required
                    </p>
                    <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                      {result.error}
                    </p>
                    <a
                      href="https://github.com/codespaces/new?repo=mifdlaldev/conduit"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center h-9 px-4 font-medium bg-neutral-200 text-neutral-900 rounded-lg hover:bg-white transition-all text-sm gap-2 w-full active:scale-[0.98]"
                    >
                      <Github className="h-4 w-4" />
                      Open in GitHub Codespaces
                    </a>
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-xl">
                    <p className="text-red-400 text-xs sm:text-sm whitespace-pre-line leading-relaxed">
                      {result.error}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success State */}
            {actionUrl && !result?.error && !loading && (
              <div ref={resultRef} className="mt-6 p-5 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl space-y-4 text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium tracking-wide">
                  <Download className="w-3 h-3" />
                  Extraction Successful
                </div>
                {result.title && (
                  <p className="text-sm text-neutral-300 break-words font-medium">{result.title}</p>
                )}
                {result.provider && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-blue-300/80 bg-blue-500/10 px-2.5 py-1 rounded-full">
                      {result.provider}
                    </span>
                    {result.deliveryMethod && (
                      <span className="text-[11px] text-neutral-500 bg-neutral-800/50 px-2.5 py-1 rounded-full">
                        {result.deliveryMethod}
                      </span>
                    )}
                  </div>
                )}
                <a
                  href={actionUrl}
                  {...(isDirectResult ? { target: '_blank', rel: 'noreferrer' } : { download: true })}
                  className="inline-flex items-center justify-center h-10 px-6 font-medium bg-neutral-100 text-neutral-900 rounded-xl hover:bg-white transition-all w-full gap-2 active:scale-[0.98] shadow-lg"
                >
                  <Download className="h-4 w-4" />
                  {isDirectResult ? 'Open Direct Video' : 'Download File'}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </a>
                {result.downloadUrl && (
                  <p className="text-[11px] text-neutral-500 break-all bg-neutral-800/30 rounded-lg p-2 text-left font-mono">
                    Source: {result.downloadUrl}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-4 text-xs text-neutral-600">
            <a
              href="https://github.com/mifdlaldev/conduit"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-neutral-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <span className="text-neutral-800">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-blue-500/70" />
              Built with TypeScript + React
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
