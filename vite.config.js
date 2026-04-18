import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.dev']  // ← this is the fastest fix for testing
  }
})