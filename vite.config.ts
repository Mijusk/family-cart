import { createHash } from 'node:crypto'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Writes /sw-precache.js with the build's files, for public/sw.js to cache them when it installs.
 * It changes with every build that changes a file, so the browser updates the worker. Fonts
 * only in the subsets Spanish uses; any other is cached if it is ever used.
 */
function swPrecache(): Plugin {
  return {
    name: 'sw-precache',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => /\.(js|css)$/.test(name) || /latin.*\.woff2$/.test(name))
        .map((name) => `/${name}`)
        .sort()
      const version = createHash('sha256').update(files.join()).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'sw-precache.js',
        source: `self.PRECACHE = ${JSON.stringify({ version, files })}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), swPrecache()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
