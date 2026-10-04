import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// 설치된 @mediapipe/tasks-vision 버전. 분석용 wasm 을 CDN 에서 받을 때 같은 버전 경로를 쓰도록 코드에 넘깁니다
// (src/features/interview/analyzer/config.ts 의 TASKS_VISION_VERSION). 패키지를 올리면 주소도 함께 바뀝니다.
const tasksVisionVersion: string = JSON.parse(
  readFileSync(fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url)), 'utf8'),
).version

// 개발 서버에서는 /api 요청을 백엔드(기본 http://localhost:8080)로 프록시합니다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __TASKS_VISION_VERSION__: JSON.stringify(tasksVisionVersion),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    test: {
      // 화면 없이 계산만 확인하는 단위 테스트 (npm run test)
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
