import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { THRESHOLDS } from './config.ts'
import { POSE, type Landmark } from './features.ts'

export interface OverlayColors {
  face: string
  shoulder: string
  wrist: string
  nose: string
}

/**
 * 캔버스에 쓸 색을 theme.css 의 토큰(CSS 변수)에서 읽어 옵니다. 화면 코드에 색 값을 직접 쓰지 않는다는 규칙을 지키려는 것으로,
 * 테마를 바꾸면 그림 색도 따라 바뀝니다 (다크 모드로 바꾼 뒤에는 이 함수를 다시 부르세요).
 */
export function readOverlayColors(root: Element = document.documentElement): OverlayColors {
  const style = getComputedStyle(root)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    face: token('--primary', 'currentColor'),
    shoulder: token('--success', 'currentColor'),
    wrist: token('--warning', 'currentColor'),
    nose: token('--destructive', 'currentColor'),
  }
}

interface DrawInput {
  faceLandmarks: Landmark[] | null
  poseLandmarks: Landmark[] | null
}

/**
 * 얼굴 윤곽, 코, 어깨(점과 선), 손목 점을 캔버스에 그립니다. 좌표는 영상 크기(width x height) 기준입니다.
 * 캔버스 안쪽 크기를 영상 크기와 같게 맞춰 두면 영상과 정확히 겹칩니다.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  { faceLandmarks, poseLandmarks }: DrawInput,
  colors: OverlayColors,
  visibilityMin: number = THRESHOLDS.poseVisibilityMin,
): void {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  const px = (l: Landmark) => ({ x: l.x * width, y: l.y * height })
  const dot = (l: Landmark, color: string, radius: number) => {
    const { x, y } = px(l)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  const lineWidth = Math.max(2, width / 400)
  const radius = Math.max(4, width / 160)
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  if (faceLandmarks) {
    ctx.strokeStyle = colors.face
    ctx.beginPath()
    for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
      const a = faceLandmarks[start]
      const b = faceLandmarks[end]
      if (!a || !b) continue
      const pa = px(a)
      const pb = px(b)
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
    }
    ctx.stroke()
  }

  if (poseLandmarks) {
    const visible = (l: Landmark | undefined): l is Landmark => l !== undefined && (l.visibility ?? 1) >= visibilityMin
    const left = poseLandmarks[POSE.LEFT_SHOULDER]
    const right = poseLandmarks[POSE.RIGHT_SHOULDER]
    if (visible(left) && visible(right)) {
      const a = px(left)
      const b = px(right)
      ctx.strokeStyle = colors.shoulder
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      dot(left, colors.shoulder, radius)
      dot(right, colors.shoulder, radius)
    }
    const nose = poseLandmarks[POSE.NOSE]
    if (visible(nose)) dot(nose, colors.nose, radius * 0.8)
    for (const index of [POSE.LEFT_WRIST, POSE.RIGHT_WRIST]) {
      const wrist = poseLandmarks[index]
      if (visible(wrist)) dot(wrist, colors.wrist, radius * 1.3)
    }
  }
}
