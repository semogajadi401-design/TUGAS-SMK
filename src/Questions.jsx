import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Ambil tautan gambar soal (bucket "lampiran") sekali untuk semua soal.
export function useQuestionUrls(questions) {
  const [urls, setUrls] = useState({})
  const key = (questions || []).map((q) => q.image_path || '').join('|')
  useEffect(() => {
    const list = (questions || []).filter((q) => q.image_path)
    if (!list.length) { setUrls({}); return }
    supabase.storage.from('lampiran').createSignedUrls(list.map((q) => q.image_path), 3600).then(({ data }) => {
      const m = {}
      list.forEach((q, i) => { if (data?.[i]?.signedUrl) m[q.id] = data[i].signedUrl })
      setUrls(m)
    })
  }, [key])
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
