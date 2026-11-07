import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Demo data is only served by the local dev server, never deployed.
const demoData = {
  name: 'demo-data',
  configureServer(server: { middlewares: { use: (p: string, h: (q: unknown, r: { setHeader: (k: string, v: string) => void; end: (b: string) => void }) => void) => void } }) {
    server.middlewares.use('/demo-data.json', (_q, r) => {
      r.setHeader('Content-Type', 'application/json')
      r.end(readFileSync(new URL('./demo/demo-data.json', import.meta.url), 'utf8'))
    })
  },
}

// Look-only preview (Msg #264): Vercel sets VERCEL_ENV=preview on branch builds; src/preview.ts reads it.
export default defineConfig({ plugins: [react(), demoData], define: { __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? '') } })
