import { authed, clean, chunk } from './_auth.js'

// Pengumuman guru untuk kelas.
//   Guru  : list, save (baru/ubah), delete
//   Siswa : list (pengumuman kelasnya), news (jumlah belum dibaca), seen (tandai sudah dibaca)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FRESH_MS = 30 * 864e5 // hanya pengumuman 30 hari terakhir yang dihitung "baru"
const byNum = (a, b) => String(a).localeCompare(String(b), 'id', { numeric: true })
const ts = (d) => new Date(d).getTime()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res, { teacher: false }); if (!a) return
  const { admin, me } = a
  const b = req.body || {}
  const bad = (code, error) => res.status(code).json({ error })
  const fail = (e, m) => res.status(500).json({ error: m + ': ' + (e?.message || e) })
  const teacher = me.role === 'teacher'

  /* ------------------------------ GURU ------------------------------ */
  if (teacher) {
    if (b.action === 'list') {
      const { data, error } = await admin.from('announcements')
        .select('id,title,body,all_classes,created_at,updated_at,announcement_classes(class_id,classes(name))')
        .order('created_at', { ascending: false }).limit(200)
      if (error) return fail(error, 'Gagal memuat pengumuman')
      return res.json({
        items: (data || []).map((x) => ({
          id: x.id, title: x.title, body: x.body, all: x.all_classes, at: x.created_at,
          edited: ts(x.updated_at) - ts(x.created_at) > 1000,
          class_ids: x.announcement_classes.map((c) => c.class_id),
          class_names: x.announcement_classes.map((c) => c.classes?.name).filter(Boolean).sort(byNum),
        })),
      })
    }

    if (b.action === 'save') {
      const title = clean(b.title)
      const body = String(b.body ?? '').replace(/\r\n?/g, '\n').trim()
      if (!title) return bad(400, 'Judul wajib diisi')
      if (title.length > 120) return bad(400, 'Judul maksimal 120 karakter')
      if (!body) return bad(400, 'Isi pengumuman wajib diisi')
      if (body.length > 4000) return bad(400, 'Isi pengumuman maksimal 4000 karakter')
      const all = b.all === true
      const ids = all ? [] : [...new Set((Array.isArray(b.class_ids) ? b.class_ids : []).filter((x) => typeof x === 'string' && UUID.test(x)))]
      if (!all && !ids.length) return bad(400, 'Pilih minimal satu kelas, atau pilih Semua kelas')
      if (ids.length) {
        const { data: ok, error } = await admin.from('classes').select('id').in('id', ids)
        if (error) return fail(error, 'Gagal memeriksa kelas')
        if ((ok || []).length !== ids.length) return bad(400, 'Ada kelas yang tidak ditemukan')
      }

      let id = b.id
      if (id) {
        if (!UUID.test(id)) return bad(400, 'ID pengumuman tidak valid')
        const up = await admin.from('announcements')
          .update({ title, body, all_classes: all, updated_at: new Date().toISOString() }).eq('id', id).select('id')
        if (up.error) return fail(up.error, 'Gagal menyimpan')
        if (!up.data?.length) return bad(404, 'Pengumuman tidak ditemukan')
      } else {
        const ins = await admin.from('announcements')
          .insert({ title, body, all_classes: all, created_by: me.id }).select('id').single()
        if (ins.error) return fail(ins.error, 'Gagal menyimpan')
        id = ins.data.id
      }

      // Samakan daftar kelas: tambah yang baru, buang yang tidak dipilih lagi.
      const { data: cur, error: e1 } = await admin.from('announcement_classes').select('class_id').eq('announcement_id', id)
      if (e1) return fail(e1, 'Gagal membaca kelas')
      const have = new Set((cur || []).map((x) => x.class_id))
      const add = ids.filter((x) => !have.has(x))
      const drop = [...have].filter((x) => !ids.includes(x))
      if (add.length) {
        const r = await admin.from('announcement_classes').insert(add.map((class_id) => ({ announcement_id: id, class_id })))
        if (r.error) {
          if (!b.id) await admin.from('announcements').delete().eq('id', id) // batalkan pengumuman baru yang setengah jadi
          return fail(r.error, 'Gagal menyimpan kelas tujuan')
        }
      }
      if (drop.length) {
        const r = await admin.from('announcement_classes').delete().eq('announcement_id', id).in('class_id', drop)
        if (r.error) return fail(r.error, 'Gagal memperbarui kelas tujuan')
      }
      return res.json({ ok: true, id })
    }

    if (b.action === 'delete') {
      if (!UUID.test(b.id || '')) return bad(400, 'ID pengumuman tidak valid')
      const r = await admin.from('announcements').delete().eq('id', b.id)
      if (r.error) return fail(r.error, 'Gagal menghapus')
      return res.json({ ok: true })
    }
    return bad(400, 'Aksi tidak dikenal')
  }

  /* ------------------------------ SISWA ----------------------------- */
  if (me.role !== 'student') return bad(403, 'Tidak diizinkan')
  const { data: prof, error: e0 } = await admin.from('profiles').select('class_id').eq('id', me.id).maybeSingle()
  if (e0) return fail(e0, 'Gagal memuat profil')
  const classId = prof?.class_id
  if (!classId) return b.action === 'news' ? res.json({ count: 0, items: [] }) : b.action === 'list' ? res.json({ items: [] }) : res.json({ ok: true })

  // Pengumuman yang boleh dilihat siswa ini: untuk semua kelas, atau untuk kelasnya.
  async function visible(cols) {
    const { data: ac, error: e1 } = await admin.from('announcement_classes').select('announcement_id').eq('class_id', classId)
    if (e1) throw e1
    const all = await admin.from('announcements').select(cols).eq('all_classes', true)
      .order('created_at', { ascending: false }).limit(100)
    if (all.error) throw all.error
    const rows = [...(all.data || [])]
    for (const part of chunk((ac || []).map((x) => x.announcement_id), 100)) {
      const r = await admin.from('announcements').select(cols).in('id', part)
      if (r.error) throw r.error
      rows.push(...(r.data || []))
    }
    const seen = new Set()
    return rows.filter((x) => !seen.has(x.id) && seen.add(x.id)).sort((x, y) => ts(y.created_at) - ts(x.created_at)).slice(0, 100)
  }
  const readSet = async () => {
    const { data, error } = await admin.from('announcement_reads').select('announcement_id').eq('student_id', me.id)
    if (error) throw error
    return new Set((data || []).map((x) => x.announcement_id))
  }
  const fresh = (x) => Date.now() - ts(x.created_at) <= FRESH_MS

  try {
    res.setHeader('Cache-Control', 'no-store')

    if (b.action === 'list') {
      const rows = await visible('id,title,body,created_at,created_by')
      const read = await readSet()
      const authors = [...new Set(rows.map((x) => x.created_by).filter(Boolean))]
      const nm = new Map()
      if (authors.length) {
        const { data } = await admin.from('profiles').select('id,full_name').in('id', authors)
        for (const p of data || []) nm.set(p.id, p.full_name)
      }
      return res.json({
        items: rows.map((x) => ({
          id: x.id, title: x.title, body: x.body, at: x.created_at,
          author: nm.get(x.created_by) || 'Guru', unread: !read.has(x.id) && fresh(x),
        })),
      })
    }

    if (b.action === 'news') {
      const rows = (await visible('id,title,created_at')).filter(fresh)
      const read = await readSet()
      const un = rows.filter((x) => !read.has(x.id))
      return res.json({ count: un.length, items: un.slice(0, 3).map((x) => ({ id: x.id, title: x.title })) })
    }

    if (b.action === 'seen') {
      const rows = (await visible('id,created_at')).filter(fresh)
      const read = await readSet()
      const add = rows.filter((x) => !read.has(x.id)).map((x) => ({ announcement_id: x.id, student_id: me.id }))
      for (const part of chunk(add, 100)) {
        const r = await admin.from('announcement_reads').upsert(part, { onConflict: 'announcement_id,student_id', ignoreDuplicates: true })
        if (r.error) throw r.error
      }
      return res.json({ ok: true })
    }
  } catch (e) { return fail(e, 'Gagal memuat pengumuman') }
  return bad(400, 'Aksi tidak dikenal')
}
