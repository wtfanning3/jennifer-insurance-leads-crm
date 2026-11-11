'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'
import { useBrand } from '@/lib/use-brand'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams()?.get('next') || '/'
  const brand = useBrand()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return setError(error.message)
    router.push(next.startsWith('/') ? next : '/')
    router.refresh()
  }

  async function forgot() {
    if (!email) return setError('Type your email first, then click "Forgot password".')
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/settings?tab=account` })
    if (error) setError(error.message)
    else setNotice('Check your email for a link to reset your password.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo_url} alt="" className="max-h-28 mx-auto" />
          <h1 className="mt-4 text-lg font-semibold text-navy">{brand.agency_name}</h1>
          <p className="text-sm text-muted">Leads CRM</p>
        </div>
        <form onSubmit={signIn} className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-crimson">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
          <button type="button" onClick={forgot} className="text-xs text-navy hover:underline w-full">Forgot password</button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
