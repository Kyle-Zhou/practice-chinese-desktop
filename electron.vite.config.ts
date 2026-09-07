import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * The renderer's Content-Security-Policy forbids inline scripts, which is what we want in the
 * packaged app but blocks the React Fast Refresh preamble that @vitejs/plugin-react injects on
 * the dev server. Without the preamble every component module throws "can't detect preamble"
 * and the window comes up blank. Relax the directive for `dev` only; the HTML that ships keeps
 * the strict policy untouched.
 */
function devCsp(): Plugin {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(`script-src 'self'`, `script-src 'self' 'unsafe-inline'`)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), devCsp()]
  }
})
