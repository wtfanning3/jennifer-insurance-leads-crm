'use client'
import { useEffect, useState } from 'react'

export interface Brand {
  agency_name: string
  agent_name: string
  logo_url: string
  icon_url: string
}

const DEFAULT_BRAND: Brand = {
  agency_name: 'Jennifer Richardson Fanning Insurance Agency',
  agent_name: 'Jennifer',
  logo_url: '/brand/logo-full.png',
  icon_url: '/brand/logo-icon.png',
}

let cache: Brand | null = null
const listeners = new Set<(b: Brand) => void>()

async function load(): Promise<Brand> {
  const res = await fetch('/i/brand', { cache: 'no-store' })
  const data = res.ok ? ((await res.json()) as Partial<Brand>) : null
  cache = {
    agency_name: data?.agency_name || DEFAULT_BRAND.agency_name,
    agent_name: data?.agent_name || DEFAULT_BRAND.agent_name,
    logo_url: data?.logo_url || DEFAULT_BRAND.logo_url,
    icon_url: data?.icon_url || DEFAULT_BRAND.icon_url,
  }
  listeners.forEach((l) => l(cache!))
  return cache
}

/** Agency name and logos from Settings (updates everywhere when Settings are saved) */
export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(cache ?? DEFAULT_BRAND)
  useEffect(() => {
    listeners.add(setBrand)
    if (!cache) load().catch(() => {})
    return () => { listeners.delete(setBrand) }
  }, [])
  return brand
}

export function refreshBrand() {
  load().catch(() => {})
}
