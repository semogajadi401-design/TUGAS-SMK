import { useState } from 'react'
import { supabase } from './supabase.js'
import Subjects from './Subjects.jsx'
import ResetData from './ResetData.jsx'
import Backup from './Backup.jsx'

export const DEFAULTS = { school_name: 'Tugas Sekolah', logo_url: '', logo_path: '', color: '#0f5c4d' }

export async function loadSettings() {
  try {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    if (!data) return DEFAULTS
    const logo_url = data.logo_path
      ? supabase.storage.from('logo').getPublicUrl(data.logo_path).data.publicUrl : ''
    return {
      school_name: data.school_name || DEFAULTS.school_name,
      logo_path: data.logo_path || '', logo_url, color: data.color || DEFAULTS.color,
    }
  } catch { return DEFAULTS }
}

export function Brand({ s, size = 40 }) {
  const st = { width: size, height: size, fontSize: size * 0.45 }
  return s.logo_url
    ? <img className="logo" style={st} src={s.logo_url} alt="" />
    : <div className="logo" style={st}>{(s.school_name || 'T')[0].toUpperCase()}</div>
}

function resize(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), 'image/png')
    }
    img.onerror = () => reject(new Error('File bukan gambar yang valid'))
    img.src = URL.createObjectURL(file)
  })
}

const PRESETS = ['#0f5c4d', '#1d4ed8', '#7c3aed', '#b91c1c', '#c2410c', '#0e7490']

export default function Settings({ s, onSaved }) {
  const [name, setName] = useState(s.school_name)
  const [color, setColor] = useState(s.color)
  const [file, setFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [msg, setMsg] = useState({ t: '', ok: false })
  const [busy, setBusy] = useState(false)

  const preview = file ? URL.createObjectURL(file) : removeLogo ? '' : s.logo_url

  async function save() {
    setBusy(true); setMsg({ t: '', ok: false })
    try {
      let logo_path = s.logo_path
      if (file) {
        const blob = await resize(file)
        const path = `logo-${Date.now()}.png`
        const up = await supabase.storage.from('logo').upload(path, blob, { contentType: 'image/png' })
        if (up.error) throw up.error
        if (logo_path) await supabase.storage.from('logo').remove([logo_path])
        logo_path = path
      } else if (removeLogo && logo_path) {
        await supabase.storage.from('logo').remove([logo_path]); logo_path = null
      }
      const { error } = await supabase.from('app_settings').update({
        school_name: name.trim() || DEFAULTS.school_name, color, logo_path,
        updated_at: new Date().toISOString(),
      }).eq('id', 1)
      if (error) throw error
      onSaved(await loadSettings())
      setFile(null); setRemoveLogo(false)
      setMsg({ t: 'Pengaturan tersimpan.', ok: true })
    } catch (e) { setMsg({ t: 'Gagal menyimpan: ' + e.message, ok: false }) }
    setBusy(false)
  }

  return (<>
    <h2>Pengaturan sekolah</h2>
    <div className="preview">
      <Brand s={{ ...s, logo_url: preview, school_name: name }} size={64} />
      <strong>{name || DEFAULTS.school_name}</strong>
    </div>
    <label htmlFor="sn">Nama sekolah</label>
    <input id="sn" value={name} onChange={(e) => setName(e.target.value)} />
    <label htmlFor="lg">Logo (PNG atau JPG, otomatis diperkecil)</label>
    <input id="lg" type="file" accept="image/png,image/jpeg,image/webp"
      onChange={(e) => { setFile(e.target.files[0] || null); setRemoveLogo(false) }} />
    {(s.logo_url || file) && !removeLogo && (
      <button className="link" style={{ marginTop: -8 }}
        onClick={() => { setFile(null); setRemoveLogo(true) }}>Hapus logo</button>
    )}
    <label>Warna aplikasi</label>
    <div className="swatches">
      {PRESETS.map((c) => (
        <button key={c} aria-label={c} className={color === c ? 'sw on' : 'sw'}
          style={{ background: c }} onClick={() => setColor(c)} />
      ))}
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
        aria-label="Warna lain" className="sw-pick" />
    </div>
    {msg.t && <div className={msg.ok ? 'ok' : 'err'}>{msg.t}</div>}
    <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
    <div style={{ height: 24 }} />
    <Subjects />
    <Backup />
    <ResetData />
  </>)
}
