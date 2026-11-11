import { NextResponse } from 'next/server'
import { supabaseForUser } from '@/lib/supabase-server'

export async function POST() {
  const supabase = await supabaseForUser()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
