// Pembantu tenggat: dipakai Beranda siswa, daftar tugas siswa, dan halaman Penilaian guru.
const DAY = 864e5
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const pad = (n) => String(n).padStart(2, '0')

// "Kamis, 8 Oktober 2026 pukul 23.59"
export function fmtFull(d) {
  if (!d) return ''
  const x = new Date(d)
  const tgl = x.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${tgl} pukul ${pad(x.getHours())}.${pad(x.getMinutes())}`
}

export const isClosed = (due) => !!due && new Date(due) < new Date()

// "besok", "3 hari lagi", "hari ini, sisa 5 jam 20 menit", "sudah berakhir"
export function relative(due) {
  const ms = new Date(due) - new Date()
  if (ms < 0) return 'sudah berakhir'
  const n = Math.round((dayStart(due) - dayStart(new Date())) / DAY)
  if (n === 0) {
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4)
    return h > 0 ? `hari ini, sisa ${h} jam${m ? ` ${m} menit` : ''}` : `hari ini, sisa ${Math.max(m, 1)} menit`
  }
  return n === 1 ? 'besok' : `${n} hari lagi`
}

// Label singkat untuk chip.
export function dueInfo(due) {
  if (!due) return { t: 'Tanpa tenggat', c: '', closed: false }
  if (isClosed(due)) return { t: 'Ditutup', c: 'late', closed: true }
  const n = Math.round((dayStart(due) - dayStart(new Date())) / DAY)
  if (n === 0) return { t: 'Hari ini', c: 'soon', closed: false }
  if (n === 1) return { t: 'Besok', c: 'soon', closed: false }
  return { t: `${n} hari lagi`, c: '', closed: false }
}

// Hari ini + n hari, pukul 23.59.
export const plusDays = (n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(23, 59, 0, 0); return x }
