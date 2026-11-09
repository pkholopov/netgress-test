import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import glsl from 'vite-plugin-glsl'
import { templateCompilerOptions } from '@tresjs/core'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv читает .env-файлы и реальные переменные окружения (VITE_BASE в CI GitHub Actions)
  const env = loadEnv(mode, '.', '')

  return {
    // База для GitHub Pages задаётся через VITE_BASE в /.github/workflows/deploy.yml,
    // локально и на других хостингах используется '/'
    base: env.VITE_BASE || '/',
    plugins: [
      vue({
        ...templateCompilerOptions,
      }),
      glsl(),
    ],
    build: {
      rollupOptions: {
        output: {
          // Функциональная форма manualChunks: в Vite 8 (rolldown) объектная форма не поддерживается
          manualChunks(id) {
            if (id.includes('node_modules/three') || id.includes('node_modules\\three')) {
              return 'three'
            }
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['vue', 'three'],
    },
  }
})
