// src/lib/preload.js
// Menyiapkan semua data sekaligus (paralel) sebelum aplikasi ditampilkan.
// Hasilnya disimpan di memori, jadi halaman lain tinggal membaca dari cache.

const cache = new Map()

export const getCached = (key) => cache.get(key)
export const setCached = (key, value) => cache.set(key, value)
export const clearCache = () => cache.clear()

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * tasks: [{ id, label, run: () => Promise<any> }]
 * onUpdate: dipanggil tiap ada tugas yang selesai
 *   -> { done, total, statuses: { [id]: 'pending' | 'ok' | 'error' } }
 * Tugas yang gagal TIDAK menghentikan yang lain; halaman terkait
 * akan mengambil datanya sendiri seperti biasa.
 */
export async function runPreload({ tasks, onUpdate, timeoutMs = 12000, minDurationMs = 1400 }) {
  const startedAt = Date.now()
  const statuses = Object.fromEntries(tasks.map((t) => [t.id, 'pending']))
  let done = 0

  const emit = () => onUpdate?.({ done, total: tasks.length, statuses: { ...statuses } })
  emit()

  await Promise.all(
    tasks.map(async (task) => {
      try {
        const result = await withTimeout(task.run(), timeoutMs)
        setCached(task.id, result)
        statuses[task.id] = 'ok'
      } catch (err) {
        console.warn(`[preload] ${task.id} gagal:`, err.message)
        statuses[task.id] = 'error'
      } finally {
        done += 1
        emit()
      }
    })
  )

  // Supaya animasi tidak berkedip cepat lalu hilang
  const elapsed = Date.now() - startedAt
  if (elapsed < minDurationMs) await wait(minDurationMs - elapsed)
}
