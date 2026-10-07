import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Splash from './Splash.jsx'
import UpdateNotice from './UpdateNotice.jsx'
import './styles.css'
createRoot(document.getElementById('root')).render(<><App /><Splash /><UpdateNotice /></>)

// Jeda animasi latar saat tab tidak terlihat.
document.addEventListener('visibilitychange', () =>
  document.documentElement.classList.toggle('paused', document.visibilityState !== 'visible'))
