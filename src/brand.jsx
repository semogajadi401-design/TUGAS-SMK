import { supabase } from './supabase.js'

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

