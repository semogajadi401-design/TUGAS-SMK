import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Splash from './Splash.jsx'
import UpdateNotice from './UpdateNotice.jsx'
import MobilePreview from './MobilePreview.jsx'
import Toaster from './Toaster.jsx'
import { initNet } from './lib/net.js'
import './styles.css'
createRoot(document.getElementById('root')).render(<><App /><Splash /><UpdateNotice /><MobilePreview /><Toaster /></>)

initNet()

// Service worker: aplikasi bisa dibuka offline dan menerima notifikasi push. Hanya di versi produksi.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

// Jeda animasi latar saat tab tidak terlihat.
document.addEventListener('visibilitychange', () =>
  document.documentElement.classList.toggle('paused', document.visibilityState !== 'visible'))
