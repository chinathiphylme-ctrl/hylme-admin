import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// served under the GitHub Pages project path
export default defineConfig({
  base: '/hylme-admin/',
  plugins: [react()],
})
