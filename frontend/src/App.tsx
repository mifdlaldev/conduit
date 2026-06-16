import { useState } from 'react'
import { Download, Loader2, Video } from 'lucide-react'
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
      const response = await axios.post('/api/v1/extract', { url }, { timeout: 60000 })
      setResult({
        downloadUrl: response.data.data.downloadUrl,
        directDownloadUrl: response.data.data.directDownloadUrl,
        proxyDownloadUrl: response.data.data.proxyDownloadUrl,
        title: response.data.data.title,
        provider: response.data.data.provider,
        deliveryMethod: response.data.data.deliveryMethod,
      })
    } catch (err: any) {
      const errorPayload = err.response?.data?.error
      const message =
        typeof errorPayload === 'string'
          ? errorPayload
          : errorPayload
            ? JSON.stringify(errorPayload)
            : err.message || 'An error occurred during extraction'

      setResult({ 
        error: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const actionUrl = result?.directDownloadUrl || result?.proxyDownloadUrl
  const isDirectResult = result?.deliveryMethod === 'direct'

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-neutral-950 to-neutral-950 pointer-events-none" />
      
      <div className="z-10 w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-full mb-4 ring-1 ring-blue-500/20">
            <Video className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Universal Downloader</h1>
          <p className="text-neutral-400 text-sm">Extract direct video sources from videqs, playvvip, fwh, and videy</p>
        </div>

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

            {result?.error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}
              </div>
            )}

            {actionUrl && (
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
                  className="inline-flex items-center justify-center h-10 px-6 font-medium bg-neutral-100 text-neutral-900 rounded-lg hover:bg-white transition-colors w-full"
                >
                  <Download className="mr-2 h-4 w-4" />
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
      </div>
    </div>
  )
}
