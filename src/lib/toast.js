// Toast sederhana tanpa library. Panggil toast({ text, kind, ms, action }) dari mana saja.
//   kind  : 'info' (default) | 'ok' | 'warn'
//   ms    : lama tampil (0 = tetap sampai ditutup)
//   action: { label, onClick }
const subs = new Set()
let n = 0

export function toast(t) {
  const item = { id: ++n, kind: 'info', ms: 6000, ...t }
  subs.forEach((f) => f(item))
  return item.id
}
export const onToast = (f) => { subs.add(f); return () => subs.delete(f) }
