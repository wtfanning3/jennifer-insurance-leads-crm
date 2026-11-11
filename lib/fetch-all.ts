'use client'

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/**
 * Every row of a query, past Supabase's 1,000-rows-per-request limit (up to `max`).
 * Usage: fetchAll((from, to) => supabase().from('leads').select('*').order('id').range(from, to))
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page, max = 20_000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}
