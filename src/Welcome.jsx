import { supabase } from './supabase.js'

const KEY = (id) => `welcome-seen-${id}`

// Sudah pernah melihat pesan? Cek di perangkat ini dan di data akun (berlaku di semua perangkat).
export async function hasSeenWelcome(userId) {
  try { if (localStorage.getItem(KEY(userId)) === '1') return true } catch { /* abaikan */ }
  try {
    const { data } = await supabase.auth.getUser()
    return !!data?.user?.user_metadata?.welcome_seen
  } catch { return true } // gangguan jaringan: jangan ganggu siswa
}

export function markWelcomeSeen(userId) {
  try { localStorage.setItem(KEY(userId), '1') } catch { /* abaikan */ }
  supabase.auth.updateUser({ data: { welcome_seen: true } }).catch(() => {})
}

const POINTS = [
  ['📝', 'Kerjakan tugas', 'Lihat tugas dari guru, lalu kirim jawabanmu berupa foto atau tulisan.'],
  ['📚', 'Belajar materi', 'Baca materi pelajaran kapan saja, di mana saja.'],
  ['🎯', 'Ikuti quiz', 'Uji pemahamanmu lewat quiz yang dibuat guru.'],
  ['⭐', 'Pantau nilai', 'Lihat nilai dan catatan guru, serta tenggat tugas di kalender.'],
]

export default function Welcome({ name, onClose }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-labelledby="wl-t">
      <div className="modal">
        <h2 id="wl-t">Selamat datang, {name}! 👋</h2>
        <p className="muted" style={{ margin: '0 0 14px' }}>
          Aplikasi ini dibuat untuk membantumu belajar dengan lebih mudah dan teratur.
        </p>
        {POINTS.map(([ic, t, d]) => (
          <div className="row" key={t} style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1.2 }} aria-hidden="true">{ic}</span>
            <div><strong>{t}</strong><div className="muted">{d}</div></div>
          </div>
        ))}
        <p style={{ margin: '14px 0' }}>
          Kerjakan dengan <strong>jujur</strong> dan kirim <strong>tepat waktu</strong>. Selamat belajar!
        </p>
        <button className="btn" onClick={onClose} autoFocus>Mengerti, mulai!</button>
      </div>
    </div>
  )
}
