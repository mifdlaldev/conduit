import { useState } from 'react'
import { Download, Loader2, Video, ExternalLink, Github } from 'lucide-react'
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

const STATUS_CONFIG = {
  direct: { label: 'Live Demo', class: 'text-green-400 bg-green-500/10 border-green-500/20' },
  full: { label: 'Full Backend', class: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
} as const

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExtractResponse & { error?: string } | null>(null)

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
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: unknown } }; message?: string }
      const errorPayload = axiosErr.response?.data?.error
      const message =
        typeof errorPayload === 'string'
          ? errorPayload
          : errorPayload
            ? JSON.stringify(errorPayload)
            : axiosErr.message || 'An error occurred during extraction'

      setResult({
        error: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const actionUrl = result?.directDownloadUrl || result?.proxyDownloadUrl
  const isDirectResult = result?.deliveryMethod === 'direct'
  const isProviderNeedsBackend = result?.error?.includes('requires a full backend')

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-neutral-950 to-neutral-950 pointer-events-none" />

      <div className="z-10 w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-full mb-4 ring-1 ring-blue-500/20">
            <Video className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Universal Downloader</h1>
          <p className="text-neutral-400 text-sm">
            Extract direct video sources from videqs, playvvip, fwh, and videy
          </p>
        </div>

        {/* Provider Status */}
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((provider) => {
            const cfg = STATUS_CONFIG[provider.status]
            return (
              <div
                key={provider.domain}
                className={`px-3 py-2 rounded-lg border text-xs ${cfg.class} flex items-center justify-between`}
              >
                <span className="font-medium">{provider.name}</span>
                <span className="opacity-80">{cfg.label}</span>
              </div>
            )
          })}
        </div>

        {/* Main Card */}
        <Card className="bg-neutral-900/50 border-neutral-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-neutral-200">Extract Video</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDownload} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="video-url" className="sr-only">Video URL</label>
                <Input
                  id="video-url"
                  type="url"
                  placeholder="Paste URL here (videqs, playvvip, fwh, videy)..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-neutral-950/50 border-neutral-800 focus-visible:ring-blue-500 text-neutral-200 placeholder:text-neutral-600"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !url}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting Stream...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Get Download Link
                  </>
                )}
              </Button>
            </form>

            {/* Error State */}
            {result?.error && (
              <div className="mt-6 space-y-3">
                {isProviderNeedsBackend ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm space-y-3">
                    <p className="text-amber-300 font-medium">⚠️ Full Backend Required</p>
                    <p className="text-neutral-300 whitespace-pre-line leading-relaxed">
                      {result.error}
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <a
                        href="https://github.com/codespaces/new?repo=mifdlaldev/link-download"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center h-10 px-4 font-medium bg-neutral-200 text-neutral-900 rounded-lg hover:bg-white transition-colors text-sm gap-2"
                      >
                        <Github className="h-4 w-4" />
                        Open in GitHub Codespaces (Free)
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 whitespace-pre-line">
                    {result.error}
                  </div>
                )}
              </div>
            )}

            {/* Success State */}
            {actionUrl && !result?.error && (
              <div className="mt-6 p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-4 text-center">
                <div className="text-blue-400 font-medium text-sm">Extraction Successful!</div>
                {result.title && (
                  <div className="text-xs text-neutral-300 break-words">{result.title}</div>
                )}
                {result.provider && (
                  <div className="text-[11px] uppercase tracking-[0.2em] text-blue-200/80">
                    Provider: {result.provider}
                  </div>
                )}
                <a
                  href={actionUrl}
                  {...(isDirectResult ? { target: '_blank', rel: 'noreferrer' } : { download: true })}
                  className="inline-flex items-center justify-center h-10 px-6 font-medium bg-neutral-100 text-neutral-900 rounded-lg hover:bg-white transition-colors w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  {isDirectResult ? 'Open Direct Video' : 'Download File'}
                </a>
                {result.downloadUrl && (
                  <div className="text-[11px] text-neutral-400 break-all">
                    Stream source detected: {result.downloadUrl}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <a
            href="https://github.com/mifdlaldev/link-download"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
