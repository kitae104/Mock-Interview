// 비언어 분석(시선·자세·표정·손 움직임) 설정 (docs/PLAN.md 5장).
// 모델 주소와 판정 임계값은 모두 이 파일에서 바꿉니다. 영상은 이 브라우저 안에서만 분석되고 서버로 전송되지 않습니다.

// ---- 모델과 wasm 주소 ----
// 분석 엔진(wasm)과 모델 파일은 처음 한 번 인터넷에서 내려받습니다 (영상이 나가는 것이 아니라 파일을 받는 것입니다).
// 막힌 네트워크에서는 내려받지 못하고, 그때는 분석 없이 면접을 진행합니다.

/** 설치된 @mediapipe/tasks-vision 버전 (vite.config.ts 가 package.json 에서 읽어 채웁니다). */
export const TASKS_VISION_VERSION: string = __TASKS_VISION_VERSION__

/** wasm 은 jsDelivr CDN 에서, 설치된 패키지와 같은 버전 경로로 받습니다. */
export const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`

/** 모델(.task)은 Google 공식 mediapipe-models 에서 받습니다. */
export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
export const POSE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

/** 모델을 내려받고 초기화하는 데 허용하는 시간. 넘으면 분석 없이 진행합니다. */
export const MODEL_LOAD_TIMEOUT_MS = 45_000

// ---- 분석 주기 ----

/** 얼굴·포즈를 분석하는 간격(ms). 100 이면 초당 약 10회. */
export const SAMPLE_INTERVAL_MS = 100
/** 분석이 이 횟수만큼 연달아 실패하면 분석을 멈추고 화면은 계속 동작하게 둡니다. */
export const MAX_CONSECUTIVE_FAILURES = 10
/** 메모리를 아끼려고 한 번에 쥐고 있는 프레임 수의 상한 (10Hz 로 5분). 넘으면 오래된 것부터 버립니다. */
export const MAX_KEPT_SAMPLES = 3000

// ---- 기준 자세 측정 (점검 화면) ----

export const BASELINE_SECONDS = 3
/** 기준 자세를 재는 동안 얼굴이 이 비율 이상 보여야 측정이 성립합니다. */
export const MIN_BASELINE_FACE_RATIO = 0.6
/** 어깨가 이 비율 이상 보여야 자세·손 지표를 쓸 수 있다고 봅니다. */
export const MIN_BASELINE_POSE_RATIO = 0.6

/** 요약 지표 JSON 형식 버전. 필드나 계산식을 바꾸면 올립니다. */
export const METRICS_VERSION = 1

// ---- 판정 임계값 (PLAN 5.2) ----
// 요약 지표 JSON 의 clientThresholds 로 함께 기록되어, 나중에 어떤 기준으로 쟀는지 알 수 있습니다.

export const THRESHOLDS = {
  /** 카메라 응시: 기준 자세 대비 머리 방향(yaw, pitch)이 이 각도(도) 이내 */
  gazeYawMaxDeg: 15,
  gazePitchMaxDeg: 15,
  /** 카메라 응시: 기준 대비 눈 방향(좌우, 상하) 변화가 이 값 이내 (블렌드셰이프 -1~1) */
  eyeHMax: 0.35,
  eyeVMax: 0.35,
  /** 미소: 기준 대비 mouthSmile 평균이 이 값 이상 */
  smileOn: 0.35,
  /** 눈 깜빡임: 눈 감김이 blinkOn 이상으로 올라갔다가 blinkOff 이하로 내려오면 1회. blinkMaxMs 보다 길면 눈을 감은 것으로 보고 제외 */
  blinkOn: 0.5,
  blinkOff: 0.3,
  blinkMaxMs: 500,
  /** 분당 깜빡임을 계산하려면 얼굴이 이 시간(초) 이상 보여야 함 */
  blinkMinFaceSeconds: 10,
  /** 자세 무너짐: 어깨가 기준보다 어깨 폭의 이 비율 이상 내려감 */
  postureDrop: 0.15,
  /** 자세 무너짐: 코-어깨 높이(목 비율)가 기준 대비 이 비율 이상 줄어듦 (고개가 어깨로 내려앉음) */
  postureNeckShrink: 0.15,
  /** 자세 무너짐: 어깨 폭이 기준보다 이 비율 이상 커짐 (카메라 쪽으로 구부정하게 기울임) */
  postureLeanGrow: 0.2,
  /** 손 제스처: 손목 속도(어깨폭/초)가 이 값 이상으로 gestureMinMs 이상 이어지면 1회, gestureGapMs 이상 잠잠해야 다음 회 */
  gestureSpeed: 0.6,
  /** 손목 속도는 이 시간(ms) 만큼 떨어진 두 프레임으로 잽니다. 프레임마다 재면 포즈 모델의 떨림(손이 가만히 있어도 어깨폭의 2~3배/초)이 제스처로 잡힙니다. */
  gestureWindowMs: 400,
  gestureMinMs: 300,
  gestureGapMs: 500,
  /** 포즈 랜드마크(손목·어깨)를 "보임"으로 치는 최소 visibility */
  poseVisibilityMin: 0.5,
  /** 손목이 보인 포즈 프레임이 이 비율 미만이면 손 지표는 측정 불가 */
  handsMinVisibleRatio: 0.1,
} as const

export type Thresholds = typeof THRESHOLDS
