import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ID unik tiap build. Disisipkan ke kode aplikasi DAN ditulis ke /version.json.
// Aplikasi yang sedang terbuka membandingkan keduanya untuk tahu ada versi baru.
const BUILD_ID = `${(process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 8)}-${Date.now().toString(36)}`

const versionFile = () => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
  },
})

export default defineConfig({
  plugins: [react(), versionFile()],
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
