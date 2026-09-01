import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), visualizer({ open: false, filename: 'dist/stats.html' })],
  resolve: {
    // neelam-ui is installed as a symlink to the local component-library
    // checkout, which has its own node_modules/react. Without this, the
    // production build ends up with two React copies and the app renders a
    // blank page ("Cannot read properties of null (reading
    // 'useSyncExternalStore')" from the library's Toast). Dev survives it;
    // `vite build` does not.
    dedupe: ['react', 'react-dom'],
  },
})
