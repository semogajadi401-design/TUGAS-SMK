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

// Perkecil foto sebelum diunggah (hemat penyimpanan dan kuota).
export async function compress(file, max = 1280, q = 0.7) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close?.()
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
      if (b) return b
    } catch { /* lanjut ke cara lama */ }
  }
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses foto'))), 'image/jpeg', q)
    }
    img.onerror = () => rej(new Error('File itu bukan foto yang valid'))
    img.src = url
  })
}
