import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { blobUrl, cacheBlob } from './lib/offline.js'

// Ambil tautan gambar soal (bucket "lampiran") sekali untuk semua soal.
// opts.cache: simpan isi gambar di perangkat (dipakai siswa) supaya soal tetap tampil saat offline.
// opts.online: status koneksi; saat offline gambar dibaca dari salinan di perangkat.
export function useQuestionUrls(questions, opts) {
  const [urls, setUrls] = useState({})
  const cache = !!opts?.cache
  const online = opts?.online ?? true
  const key = (questions || []).map((q) => q.image_path || '').join('|')
  useEffect(() => {
    let off = false
    const list = (questions || []).filter((q) => q.image_path)
    if (!list.length) { setUrls({}); return undefined }
    const fromDevice = async () => {
      const arr = await Promise.all(list.map(async (q) => [q.id, await blobUrl('lampiran', q.image_path)]))
      if (!off) setUrls(Object.fromEntries(arr.filter(([, u]) => u)))
    }
    if (cache && !online) { fromDevice(); return () => { off = true } }
    supabase.storage.from('lampiran').createSignedUrls(list.map((q) => q.image_path), 3600).then(({ data }) => {
      if (off) return
      if (!data && cache) { fromDevice(); return }
      const m = {}
      list.forEach((q, i) => {
        if (data?.[i]?.signedUrl) {
          m[q.id] = data[i].signedUrl
          if (cache) cacheBlob('lampiran', q.image_path, data[i].signedUrl)
        }
      })
      setUrls(m)
    })
    return () => { off = true }
  }, [key, cache && online])
  return urls
}

// Tampilan satu soal (nomor, teks, gambar). Dipakai di sisi siswa, guru, dan penilaian.
export function QuestionHead({ n, q, url, onZoom }) {
  return (<>
    <div className="qnum">Soal {n}</div>
    {q.text && <div className="qtext">{q.text}</div>}
    {url && <img className="qimg" src={url} alt={`Gambar soal ${n}`} loading="lazy" decoding="async"
      onClick={onZoom ? () => onZoom(url) : undefined} />}
  </>)
}
