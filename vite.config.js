import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// ID unik tiap build. Disisipkan ke kode aplikasi DAN ditulis ke /version.json.
// Aplikasi yang sedang terbuka membandingkan keduanya untuk tahu ada versi baru.
const BUILD_ID = `${(process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 8)}-${Date.now().toString(36)}`

const versionFile = () => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
  },
})

// Membuat /sw.js saat build. Daftar file yang disimpan di perangkat dihitung dari hasil build:
// kerangka aplikasi + halaman siswa saja (halaman guru dan library Excel tidak ikut, supaya hemat kuota siswa).
const STUDENT_PAGES = ['StudentTasks', 'StudentMaterials', 'StudentQuiz', 'Calendar']
const swFile = () => ({
  name: 'sw-file',
  apply: 'build',
  enforce: 'post',
  generateBundle(_, bundle) {
    const keep = new Set()
    const walk = (file) => {
      const c = bundle[file]
      if (!c || c.type !== 'chunk' || keep.has(file)) return
      keep.add(file)
      c.imports.forEach(walk)
      c.viteMetadata?.importedCss?.forEach((f) => keep.add(f))
      c.viteMetadata?.importedAssets?.forEach((f) => keep.add(f))
    }
    for (const [file, c] of Object.entries(bundle)) {
      if (c.type !== 'chunk') continue
      const id = c.facadeModuleId || ''
      if (c.isEntry || (c.isDynamicEntry && STUDENT_PAGES.some((n) => id.endsWith('/' + n + '.jsx')))) walk(file)
    }
    const list = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
      ...[...keep].map((f) => '/' + f)]
    const src = fs.readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8')
      .replace('__BUILD_ID__', BUILD_ID)
      .replace('__BUILD_TS__', String(Date.now()))
      .replace('__PRECACHE__', JSON.stringify([...new Set(list)]))
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: src })
  },
})

export default defineConfig({
  plugins: [react(), versionFile(), swFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Library besar dipisah supaya bisa di-cache browser dan tidak dimuat ulang tiap deploy.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
