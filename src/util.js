import { supabase } from './supabase.js'

export async function callApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Gagal menghubungi server')
  return j
}

// Ambil semua baris (Supabase membatasi 1000 baris per permintaan).
export async function fetchAll(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
export const listText = (title, names) => `${title}\n` + names.map((n, i) => `${i + 1}. ${n}`).join('\n')

export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Library Excel (~400 KB) hanya diunduh saat benar-benar dipakai (ekspor/impor).
let xlsxP
export const loadXlsx = () => (xlsxP ||= import('xlsx'))
