import { useEffect, useState } from 'react'
import { callApi } from './util.js'

const shuffle = (a) => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] }
  return x
}

export default function GroupEditor({ task, onBack }) {
  const [studs, setStuds] = useState(null)
  const [groups, setGroups] = useState([])
  const [assign, setAssign] = useState({})
  const [size, setSize] = useState(4)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    callApi('/api/group', { action: 'list', assignment_id: task.id }).then((j) => {
      setStuds(j.students)
      setGroups(j.groups.map((g) => ({ key: g.id, name: g.name, leader: g.leader_id })))
      const a = {}; j.groups.forEach((g) => g.members.forEach((m) => { a[m] = g.id })); setAssign(a)
    }).catch((e) => { setStuds([]); setMsg({ ok: false, t: e.message }) })
  }, [])

  if (!studs) return <div className="empty">Memuat...</div>
  const membersOf = (key) => studs.filter((s) => assign[s.id] === key)
  const leaderOf = (g) => { const m = membersOf(g.key); return m.find((s) => s.id === g.leader)?.id || m[0]?.id || '' }
  const loose = studs.filter((s) => !assign[s.id]).length

  function auto() {
    const n = Math.max(2, Number(size) || 4)
    const byClass = {}
    studs.forEach((s) => { (byClass[s.kelas] = byClass[s.kelas] || []).push(s) })
    const gs = [], as = {}
    let c = 0
    Object.values(byClass).forEach((list) => {
      const count = Math.max(1, Math.round(list.length / n))
      const keys = Array.from({ length: count }, () => { c++; const key = crypto.randomUUID(); gs.push({ key, name: 'Kelompok ' + c, leader: '' }); return key })
      shuffle(list).forEach((s, i) => { as[s.id] = keys[i % count] })
    })
    setGroups(gs); setAssign(as); setMsg(null)
  }
  const addGroup = () => setGroups([...groups, { key: crypto.randomUUID(), name: 'Kelompok ' + (groups.length + 1), leader: '' }])
  const removeGroup = (key) => {
    setGroups(groups.filter((g) => g.key !== key))
    setAssign(Object.fromEntries(Object.entries(assign).filter(([, k]) => k !== key)))
  }
  const rename = (key, name) => setGroups(groups.map((g) => (g.key === key ? { ...g, name } : g)))
  const setLeader = (key, leader) => setGroups(groups.map((g) => (g.key === key ? { ...g, leader } : g)))
  const move = (sid, key) => setAssign({ ...assign, [sid]: key })

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const payload = groups.map((g) => ({ name: g.name, leader_id: leaderOf(g), members: membersOf(g.key).map((s) => s.id) })).filter((g) => g.members.length)
      const j = await callApi('/api/group', { action: 'save', assignment_id: task.id, groups: payload })
      setMsg({ ok: true, t: `${j.groups} kelompok tersimpan.` })
    } catch (e) { setMsg({ ok: false, t: e.message }) }
    setBusy(false)
  }

  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>Kelompok: {task.title}</h2>
    <p className="muted">Ketua kelompok yang mengirim jawaban. Anggota lain melihat statusnya dan mendapat nilai yang sama.</p>
    <div className="panel">
      <label htmlFor="gs">Anggota per kelompok</label>
      <input id="gs" type="number" min="2" max="10" value={size} onChange={(e) => setSize(e.target.value)} />
      <button className="btn ghost" onClick={auto}>Bagi otomatis (acak per kelas)</button>
      <button className="link" onClick={addGroup}>Tambah kelompok kosong</button>
    </div>
    {groups.map((g) => {
      const m = membersOf(g.key)
      return (
        <div className="panel" key={g.key}>
          <input value={g.name} aria-label="Nama kelompok" onChange={(e) => rename(g.key, e.target.value)} />
          <label>Ketua</label>
          <select value={leaderOf(g)} onChange={(e) => setLeader(g.key, e.target.value)} disabled={!m.length}>
            {m.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="muted">{m.length} anggota: {m.map((s) => s.name).join(', ') || '-'}</p>
          <button className="link" style={{ marginTop: 0, color: 'var(--danger)' }} onClick={() => removeGroup(g.key)}>Hapus kelompok</button>
        </div>
      )
    })}
    <h3 className="sec">Pembagian siswa {loose > 0 && <span className="muted">· {loose} belum dapat kelompok</span>}</h3>
    {studs.map((s) => (
      <div className="line" key={s.id}>
        <span>{s.name} <span className="muted">{s.kelas}</span></span>
        <select style={{ width: 'auto', marginBottom: 0 }} value={assign[s.id] || ''} onChange={(e) => move(s.id, e.target.value)}>
          <option value="">Tanpa kelompok</option>
          {groups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
        </select>
      </div>
    ))}
    {msg && <div className={msg.ok ? 'ok' : 'err'} role="status" style={{ marginTop: 12 }}>{msg.t}</div>}
    <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? 'Menyimpan...' : 'Simpan kelompok'}</button>
  </>)
}
