// 카메라·마이크를 못 쓸 때의 원인 분류와 한국어 안내 (docs/PLAN.md 8장 ②).

export type MediaFailureKind = 'insecure' | 'unsupported' | 'denied' | 'no-device' | 'in-use' | 'unknown'
export type MediaFailureTarget = 'camera' | 'microphone' | 'both' | null

export interface MediaFailure {
  kind: MediaFailureKind
  /** 어떤 장치 때문인지 알 수 있을 때만 */
  target: MediaFailureTarget
  title: string
  description: string
  /** 해결 방법 (순서대로) */
  steps: string[]
  /** 원인을 찾을 때 참고하는 기술 정보 (예: "NotReadableError: Could not start video source") */
  detail?: string
}

/** getUserMedia 가 던진 오류를 원인 종류로 나눕니다. */
export function classifyMediaError(err: unknown): MediaFailureKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'no-device'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use'
    case 'SecurityError':
      return window.isSecureContext ? 'denied' : 'insecure'
    default:
      return 'unknown'
  }
}

const targetName: Record<Exclude<MediaFailureTarget, null>, string> = {
  camera: '카메라',
  microphone: '마이크',
  both: '카메라와 마이크',
}

export function describeMediaFailure(kind: MediaFailureKind, target: MediaFailureTarget = null, err?: unknown): MediaFailure {
  const device = target ? targetName[target] : '카메라나 마이크'
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : undefined

  switch (kind) {
    case 'insecure':
      return {
        kind,
        target,
        title: '보안 연결이 아니어서 카메라·마이크를 쓸 수 없어요',
        description:
          '브라우저는 보안 연결(HTTPS)이거나 localhost 로 연 페이지에서만 카메라와 마이크를 허용합니다. 지금 주소는 그 조건에 맞지 않습니다.',
        steps: [
          '주소창이 https:// 또는 http://localhost 로 시작하는지 확인하세요.',
          '같은 PC 에서 서비스를 실행 중이라면 IP 주소(예: http://192.168.0.5:3000) 대신 http://localhost:3000 으로 접속하세요.',
          '다른 기기에서 접속해야 한다면 서비스를 HTTPS 로 제공해야 합니다. 관리자에게 문의하세요.',
        ],
      }
    case 'unsupported':
      return {
        kind,
        target,
        title: '이 브라우저에서는 카메라·마이크를 쓸 수 없어요',
        description: '카메라와 마이크 접근 기능을 찾을 수 없습니다. 오래된 브라우저이거나 앱 안의 간이 브라우저일 수 있습니다.',
        steps: [
          '데스크톱 Chrome 또는 Edge 최신 버전으로 다시 열어 주세요.',
          '카카오톡·네이버 앱 같은 앱 안의 브라우저가 아니라 기본 브라우저 앱에서 열어 주세요.',
        ],
      }
    case 'denied':
      return {
        kind,
        target,
        title: '카메라·마이크 사용이 허용되지 않았어요',
        description: '브라우저 또는 운영체제가 이 사이트의 카메라·마이크 사용을 막고 있습니다. 허용 창에서 "차단"을 눌렀거나 창이 닫혔을 수 있습니다.',
        steps: [
          '주소창 왼쪽의 자물쇠(또는 설정) 아이콘을 눌러 "카메라"와 "마이크"를 "허용"으로 바꾸세요.',
          '바꾼 뒤 아래 [다시 시도]를 누르거나 페이지를 새로고침하세요.',
          'Windows: 설정 → 개인 정보 및 보안 → 카메라/마이크에서 "데스크톱 앱이 카메라/마이크에 액세스하도록 허용"이 켜져 있는지 확인하세요.',
          'macOS: 시스템 설정 → 개인정보 보호 및 보안 → 카메라/마이크에서 사용 중인 브라우저를 켜세요.',
        ],
      }
    case 'no-device':
      return {
        kind,
        target,
        title: `${device}를 찾을 수 없어요`,
        description: `${device}가 연결되어 있지 않거나 운영체제가 인식하지 못하고 있습니다.`,
        steps: [
          '웹캠과 마이크(헤드셋)가 PC 에 제대로 연결되어 있는지 확인하세요. USB 장치는 뽑았다가 다시 꽂아 보세요.',
          'Windows 장치 관리자(또는 macOS 시스템 정보)에서 장치가 보이는지, "사용 안 함" 상태가 아닌지 확인하세요.',
          '노트북의 카메라 덮개나 키보드의 카메라 끄기 키가 켜져 있지 않은지 확인하세요.',
          '장치를 연결한 뒤 아래 [다시 시도]를 누르세요.',
        ],
      }
    case 'in-use':
      return {
        kind,
        target,
        title: `다른 프로그램이 ${device}를 사용 중이에요`,
        description: `${device}를 이 페이지에서 열 수 없습니다. 다른 앱이나 브라우저 탭이 이미 사용하고 있을 가능성이 큽니다.`,
        steps: [
          'Zoom, Teams, Google Meet, 카카오톡 화상통화, OBS 같은 화상 프로그램을 모두 종료하세요.',
          '카메라·마이크를 쓰는 다른 브라우저 탭이나 창이 있으면 닫으세요.',
          '그래도 안 되면 브라우저를 완전히 종료했다가 다시 열거나, 아래에서 다른 장치를 선택해 보세요.',
          '정리한 뒤 아래 [다시 시도]를 누르세요.',
        ],
        detail,
      }
    default:
      return {
        kind: 'unknown',
        target,
        title: '카메라·마이크를 시작하지 못했어요',
        description: '원인을 알 수 없는 오류가 발생했습니다.',
        steps: [
          '아래 [다시 시도]를 눌러 보세요.',
          '브라우저를 새로고침하거나 완전히 종료했다가 다시 열어 보세요.',
          '계속 안 되면 다른 브라우저(Chrome, Edge)로 열어 보세요.',
        ],
        detail,
      }
  }
}
