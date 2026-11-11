'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useBrand } from '@/lib/use-brand'
import { supabase } from '@/lib/supabase-browser'

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { href: '/leads', label: 'Leads', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { href: '/messages', label: 'Text Messages', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { href: '/leads?followup=due', label: 'Follow-ups Due', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
  { href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const brand = useBrand()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [search, setSearch] = useState('')
  const isPublic = pathname.startsWith('/login')

  useEffect(() => {
    if (isPublic) return
    const check = () =>
      supabase().from('leads').select('unread_messages').gt('unread_messages', 0).then(({ data }) => setUnread((data ?? []).reduce((n, r) => n + (r.unread_messages ?? 0), 0)))
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [isPublic, pathname])

  if (isPublic) return <>{children}</>

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    await supabase().auth.signOut().catch(() => {})
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 bg-white border-b border-line flex items-center gap-3 px-4 sm:px-6 sticky top-0 z-30">
        <button className="sm:hidden btn-ghost px-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.icon_url} alt="" className="h-9 w-auto shrink-0" />
          <span className="font-semibold text-navy truncate hidden sm:inline">{brand.agency_name}</span>
        </Link>
        <form
          className="ml-auto w-full max-w-xs"
          onSubmit={(e) => {
            e.preventDefault()
            router.push(`/leads?q=${encodeURIComponent(search)}`)
          }}
        >
          <input className="input" placeholder="Search leads (name, phone, email)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </header>
      <div className="flex flex-1 min-h-0">
        {open && <div className="fixed inset-0 bg-black/30 z-30 sm:hidden" onClick={() => setOpen(false)} />}
        <aside className={`fixed sm:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-60 shrink-0 bg-white border-r border-line flex flex-col transition-transform sm:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV.map((n) => {
              const base = n.href.split('?')[0]
              const active = n.href.includes('?') ? false : base === '/' ? pathname === '/' : pathname.startsWith(base)
              return (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium ${active ? 'bg-navy text-white' : 'text-ink hover:bg-sky-light'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                  <span className="flex-1">{n.label}</span>
                  {n.href === '/messages' && unread > 0 && <span className="rounded-full bg-crimson text-white text-xs px-2 py-0.5">{unread}</span>}
                </Link>
              )
            })}
          </nav>
          <div className="p-3 border-t border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logo_url} alt={brand.agency_name} className="max-h-16 mx-auto mb-3" />
            <button onClick={signOut} className="btn-ghost w-full">Sign out</button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-6 max-w-6xl">{children}</main>
      </div>
    </div>
  )
}
