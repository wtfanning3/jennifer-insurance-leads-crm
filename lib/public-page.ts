import 'server-only'
import { NextResponse } from 'next/server'
import { escapeHtml } from './email'
import { logoUrl, type Settings } from './settings'

/** A small branded page for people who tap a link in a text (not signed in) */
export function publicPage(s: Settings, title: string, inner: string, extraHead = ''): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - ${escapeHtml(s.agency_name ?? '')}</title><meta name="robots" content="noindex">${extraHead}
<style>
body{margin:0;background:#F7F8FB;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1F2430}
.wrap{max-width:440px;margin:0 auto;padding:32px 16px;text-align:center}
.card{background:#fff;border:1px solid #E4E7EC;border-radius:14px;padding:28px 20px;margin-top:16px}
h1{font-size:22px;margin:0 0 8px;color:#0B2F86} p{color:#475467;line-height:1.5;margin:8px 0}
.btn{display:block;background:#0B2F86;color:#fff;text-decoration:none;font-weight:700;font-size:18px;padding:16px;border-radius:10px;border:0;width:100%;cursor:pointer;margin-top:16px}
.btn.red{background:#C8102E} .small{font-size:13px;color:#667085;margin-top:20px}
img.logo{max-width:220px;max-height:110px}
</style></head><body><div class="wrap"><img class="logo" src="${escapeHtml(logoUrl(s))}" alt="${escapeHtml(s.agency_name ?? '')}">
<div class="card">${inner}</div><p class="small">${escapeHtml(s.agency_name ?? '')}${s.license_number ? ` &middot; License #${escapeHtml(s.license_number)}` : ''}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )
}
