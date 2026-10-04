import { describe, expect, it } from 'vitest'
import { blendshapeMap, buildFrameSample, eyeDirection, headPoseFromMatrix, lineTiltDeg, POSE, smileScore, blinkScore, type Landmark } from './features.ts'

type Mat3 = number[][]

const rad = (deg: number) => (deg * Math.PI) / 180
const rotX = (a: number): Mat3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]]
const rotY = (a: number): Mat3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]]
const rotZ = (a: number): Mat3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]]
const mul = (a: Mat3, b: Mat3): Mat3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))

/** 3x3 회전을 얼굴 변환 행렬(4x4, 열 우선)로 만듭니다. scale 과 이동을 섞어 실제 행렬처럼 만듭니다. */
function toMatrix(r: Mat3, scale = 1): number[] {
  const data = new Array(16).fill(0)
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) data[col * 4 + row] = r[row][col] * scale
  data[12] = 1.5
  data[13] = -2
  data[14] = -40
  data[15] = 1
  return data
}

describe('headPoseFromMatrix', () => {
  it('정면(단위 행렬)이면 모두 0 도', () => {
    const pose = headPoseFromMatrix(toMatrix(mul(mul(rotX(0), rotY(0)), rotZ(0))))!
    expect(pose.yawDeg).toBeCloseTo(0)
    expect(pose.pitchDeg).toBeCloseTo(0)
    expect(pose.rollDeg).toBeCloseTo(0)
  })

  it('축 하나만 돌린 각도를 그대로 읽는다 (yaw=Y축, pitch=X축, roll=Z축)', () => {
    expect(headPoseFromMatrix(toMatrix(rotY(rad(30))))!.yawDeg).toBeCloseTo(30)
    expect(headPoseFromMatrix(toMatrix(rotX(rad(-20))))!.pitchDeg).toBeCloseTo(-20)
    expect(headPoseFromMatrix(toMatrix(rotZ(rad(12))))!.rollDeg).toBeCloseTo(12)
  })

  it('세 축을 함께 돌려도 각도가 돌아온다', () => {
    const r = mul(mul(rotX(rad(15)), rotY(rad(-25))), rotZ(rad(8)))
    const pose = headPoseFromMatrix(toMatrix(r))!
    expect(pose.pitchDeg).toBeCloseTo(15)
    expect(pose.yawDeg).toBeCloseTo(-25)
    expect(pose.rollDeg).toBeCloseTo(8)
  })

  it('행렬에 크기 변환이 섞여 있어도 각도는 같다', () => {
    const r = mul(rotX(rad(10)), rotY(rad(40)))
    const pose = headPoseFromMatrix(toMatrix(r, 7.5))!
    expect(pose.yawDeg).toBeCloseTo(40)
    expect(pose.pitchDeg).toBeCloseTo(10)
  })

  it('읽을 수 없는 행렬은 null', () => {
    expect(headPoseFromMatrix([1, 2, 3])).toBeNull()
    expect(headPoseFromMatrix(new Array(16).fill(0))).toBeNull()
  })
})

describe('blendshapes', () => {
  const b = blendshapeMap([
    { categoryName: 'eyeLookInLeft', score: 0.6 },
    { categoryName: 'eyeLookOutRight', score: 0.4 },
    { categoryName: 'eyeLookUpLeft', score: 0.2 },
    { categoryName: 'eyeLookUpRight', score: 0.2 },
    { categoryName: 'mouthSmileLeft', score: 0.5 },
    { categoryName: 'mouthSmileRight', score: 0.3 },
    { categoryName: 'eyeBlinkLeft', score: 0.9 },
    { categoryName: 'eyeBlinkRight', score: 0.7 },
  ])

  it('눈 방향: 오른쪽·위를 보면 h, v 가 양수', () => {
    const eyes = eyeDirection(b)
    expect(eyes.h).toBeCloseTo(0.5)
    expect(eyes.v).toBeCloseTo(0.2)
  })

  it('눈 방향: 왼쪽·아래를 보면 음수', () => {
    const eyes = eyeDirection({ eyeLookOutLeft: 0.8, eyeLookInRight: 0.6, eyeLookDownLeft: 0.4, eyeLookDownRight: 0.6 })
    expect(eyes.h).toBeCloseTo(-0.7)
    expect(eyes.v).toBeCloseTo(-0.5)
  })

  it('미소와 눈 감김은 양쪽 평균', () => {
    expect(smileScore(b)).toBeCloseTo(0.4)
    expect(blinkScore(b)).toBeCloseTo(0.8)
  })

  it('없는 값은 0 으로 본다', () => {
    expect(eyeDirection({})).toEqual({ h: 0, v: 0 })
    expect(smileScore({})).toBe(0)
  })
})

describe('lineTiltDeg', () => {
  it('왼쪽/오른쪽 어느 쪽을 먼저 넣어도 같은 기울기', () => {
    const a = { x: 0.4, y: 0.5 }
    const b = { x: 0.6, y: 0.52 }
    expect(lineTiltDeg(a, b)).toBeCloseTo(lineTiltDeg(b, a))
    expect(lineTiltDeg(a, b)).toBeGreaterThan(0)
  })

  it('수평이면 0 도, 90 도를 넘지 않는다', () => {
    expect(lineTiltDeg({ x: 0, y: 1 }, { x: 1, y: 1 })).toBeCloseTo(0)
    expect(Math.abs(lineTiltDeg({ x: 0, y: 0 }, { x: -1, y: -5 }))).toBeLessThanOrEqual(90)
  })
})

describe('buildFrameSample', () => {
  const pose = (overrides: Record<number, Landmark> = {}): Landmark[] => {
    const list: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
    list[POSE.NOSE] = { x: 0.5, y: 0.3, visibility: 1 }
    list[POSE.LEFT_SHOULDER] = { x: 0.6, y: 0.6, visibility: 1 }
    list[POSE.RIGHT_SHOULDER] = { x: 0.4, y: 0.6, visibility: 1 }
    for (const [i, l] of Object.entries(overrides)) list[Number(i)] = l
    return list
  }

  it('얼굴과 포즈가 없으면 모든 값이 비어 있다', () => {
    const s = buildFrameSample({ t: 100, aspect: 16 / 9, face: null, pose: null })
    expect(s.faceVisible).toBe(false)
    expect(s.poseVisible).toBe(false)
    expect(s.yawDeg).toBeNull()
    expect(s.shoulderWidth).toBeNull()
    expect(s.t).toBe(100)
  })

  it('어깨: 가로세로 비율로 보정한 폭과 기울기, 코-어깨 높이', () => {
    const s = buildFrameSample({ t: 0, aspect: 2, face: null, pose: pose() })
    expect(s.poseVisible).toBe(true)
    expect(s.shoulderWidth).toBeCloseTo(0.4) // (0.6-0.4) * aspect(2)
    expect(s.shoulderTiltDeg).toBeCloseTo(0)
    expect(s.shoulderMidY).toBeCloseTo(0.6)
    expect(s.neckRatio).toBeCloseTo((0.6 - 0.3) / 0.4)
  })

  it('어깨가 한쪽이라도 잘 안 보이면 어깨 값은 null', () => {
    const s = buildFrameSample({ t: 0, aspect: 1, face: null, pose: pose({ [POSE.LEFT_SHOULDER]: { x: 0.6, y: 0.6, visibility: 0.2 } }) })
    expect(s.poseVisible).toBe(false)
    expect(s.shoulderWidth).toBeNull()
  })

  it('손목은 visibility 가 충분할 때만 위치를 준다', () => {
    const s = buildFrameSample({
      t: 0,
      aspect: 2,
      face: null,
      pose: pose({
        [POSE.LEFT_WRIST]: { x: 0.7, y: 0.8, visibility: 0.9 },
        [POSE.RIGHT_WRIST]: { x: 0.3, y: 0.8, visibility: 0.1 },
      }),
    })
    expect(s.leftWrist).toEqual({ x: 1.4, y: 0.8 })
    expect(s.rightWrist).toBeNull()
  })

  it('얼굴: 행렬과 블렌드셰이프에서 머리 방향·눈·미소·깜빡임을 채운다', () => {
    const s = buildFrameSample({
      t: 0,
      aspect: 1,
      face: {
        matrix: toMatrix(rotY(rad(20))),
        blendshapes: [
          { categoryName: 'mouthSmileLeft', score: 0.6 },
          { categoryName: 'mouthSmileRight', score: 0.6 },
          { categoryName: 'eyeBlinkLeft', score: 0.1 },
        ],
      },
      pose: null,
    })
    expect(s.faceVisible).toBe(true)
    expect(s.yawDeg).toBeCloseTo(20)
    expect(s.smile).toBeCloseTo(0.6)
    expect(s.blink).toBeCloseTo(0.05)
  })
})
