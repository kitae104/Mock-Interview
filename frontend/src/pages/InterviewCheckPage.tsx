import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewConfig, type InterviewDetail } from '../api/interviews.ts'
import ConsentNotice from '../components/interview/ConsentNotice.tsx'
import CameraPreview from '../components/interview/CameraPreview.tsx'
import RetryInterviewButton from '../components/interview/RetryInterviewButton.tsx'
import MediaFailurePanel from '../components/interview/MediaFailurePanel.tsx'
import MicLevelMeter from '../components/interview/MicLevelMeter.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import SelectField from '../components/ui/SelectField.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { BASELINE_SECONDS } from '../features/interview/analyzer/config.ts'
import { measureBaseline } from '../features/interview/analyzer/measureBaseline.ts'
import type { Baseline, BaselineFailure } from '../features/interview/analyzer/types.ts'
import { useNonverbalAnalyzer } from '../features/interview/analyzer/useNonverbalAnalyzer.ts'
import { loadCheckPrefs, saveCheckPrefs } from '../features/interview/checkPrefs.ts'
import { cancelSpeech, getVoiceInstallGuide, speak } from '../features/interview/speech.ts'
import { useAudioLevel } from '../features/interview/useAudioLevel.ts'
import { useKoreanVoice } from '../features/interview/useKoreanVoice.ts'
import { useMediaStream } from '../features/interview/useMediaStream.ts'
import { cn } from '../lib/cn.ts'

const TEST_SENTENCE = '안녕하세요. 모의 면접을 시작하겠습니다.'

type TestState = 'idle' | 'speaking' | 'done' | 'failed'

function Step({ number, label, state }: { number: number; label: string; state: 'done' | 'current' | 'todo' }) {
  return (
    <li
      aria-current={state === 'current' ? 'step' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
        state === 'current' ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground shadow-card',
      )}
    >
      {state === 'done' ? (
        <Icon name="check_circle" size={18} className="text-success" />
      ) : (
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-full font-mono text-xs',
            state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {number}
        </span>
      )}
      {label}
    </li>
  )
}

function CheckItem({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className={cn('flex items-start gap-2 rounded-control px-3 py-2 text-sm', ok ? 'bg-success/10' : 'bg-muted')}>
      <Icon
        name={ok ? 'check_circle' : 'radio_button_unchecked'}
        size={20}
        className={cn('mt-px', ok ? 'text-success' : 'text-muted-foreground')}
      />
      <span className="min-w-0">
        <span className={cn('font-medium', !ok && 'text-muted-foreground')}>{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </li>
  )
}

function CardTitle({ icon, children, aside }: { icon: string; children: string; aside?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-heading text-base font-bold">
        <Icon name={icon} size={20} className="text-primary" />
        {children}
      </h2>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  )
}

export default function InterviewCheckPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [config, setConfig] = useState<InterviewConfig | null>(null)
  const [consent, setConsent] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const prefs = useMemo(() => loadCheckPrefs(id), [id])
  const media = useMediaStream({ initialCameraId: prefs?.cameraId, initialMicrophoneId: prefs?.microphoneId })
  const audio = useAudioLevel(media.stream)
  const koreanVoice = useKoreanVoice()

  // 표정·자세 분석: 같은 <video> 를 분석기에 연결합니다. 모델을 쓸 수 없으면 분석 없이 진행합니다.
  const videoRef = useRef<HTMLVideoElement>(null)
  const analysis = useNonverbalAnalyzer({ videoRef, stream: media.stream })
  const [measured, setMeasured] = useState<{ baseline: Baseline; stream: MediaStream | null } | null>(null)
  const [measureProgress, setMeasureProgress] = useState<number | null>(null)
  const [measureFailure, setMeasureFailure] = useState<BaselineFailure | null>(null)
  const measureAbortRef = useRef<AbortController | null>(null)

  const [textOnly, setTextOnly] = useState(prefs?.speech === 'off')
  const [test, setTest] = useState<TestState>('idle')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .get(id)
      .then((data) => !cancelled && setInterview(data))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : '면접을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .config()
      .then((data) => !cancelled && setConfig(data))
      .catch(() => !cancelled && setStartError('안내 문구 버전을 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.'))
    return () => {
      cancelled = true
    }
  }, [])

  // 화면을 떠나면 읽던 소리를 멈춥니다. (카메라·마이크는 useMediaStream 이 닫습니다.)
  useEffect(
    () => () => {
      abortRef.current?.abort()
      cancelSpeech()
    },
    [],
  )

  // 카메라가 바뀌거나 화면을 떠나면 진행 중인 기준 자세 측정을 멈춥니다.
  useEffect(() => {
    return () => measureAbortRef.current?.abort()
  }, [media.stream])

  const noVoice = !koreanVoice.loading && !koreanVoice.voice
  const textOnlyMode = textOnly || noVoice
  const soundOk = textOnlyMode || test === 'done'
  const permissionOk = media.status === 'ready'
  const cameraOk = permissionOk && media.stream?.getVideoTracks()[0]?.readyState === 'live'
  const micOk = permissionOk && audio.detected
  // 분석 모델을 쓸 수 없으면(네트워크 차단 등) 기준 자세 없이도 진행할 수 있습니다.
  const analysisUnavailable = analysis.status === 'unavailable'
  const baseline = measured && measured.stream === media.stream ? measured.baseline : null
  const baselineOk = analysisUnavailable ? permissionOk : baseline !== null
  const measuring = measureProgress !== null
  const devicesOk = Boolean(cameraOk) && micOk && soundOk && baselineOk
  const allOk = devicesOk && consent && config !== null
  const busy = media.status === 'requesting'

  const playTest = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setTest('speaking')
    try {
      const result = await speak(TEST_SENTENCE, { voice: koreanVoice.voice, signal: controller.signal })
      setTest(result === 'ended' ? 'done' : 'idle')
    } catch {
      setTest('failed')
    }
  }

  const stopTest = () => abortRef.current?.abort()

  const startMeasure = async () => {
    measureAbortRef.current?.abort()
    const controller = new AbortController()
    measureAbortRef.current = controller
    const stream = media.stream
    setMeasureFailure(null)
    setMeasureProgress(0)
    const result = await measureBaseline(analysis.analyzer, { signal: controller.signal, onProgress: setMeasureProgress })
    if (controller.signal.aborted) return // 화면을 떠났거나 카메라가 바뀜: 결과를 쓰지 않음
    setMeasureProgress(null)
    if (result && result.ok) setMeasured({ baseline: result.baseline, stream })
    else if (result) setMeasureFailure(result.reason)
  }

  const handleReady = async () => {
    if (!config || starting) return
    const useAnalysis = baseline !== null && !analysisUnavailable
    setStarting(true)
    setStartError(null)
    try {
      // 동의를 서버에 기록하고 면접을 시작합니다. 이 호출이 성공해야 답변 음성을 올릴 수 있습니다.
      await interviewsApi.start(id, {
        consent,
        consentVersion: config.consentVersion,
        nonverbalEnabled: useAnalysis,
        baseline: useAnalysis ? baseline : null,
      })
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : '면접을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setStarting(false)
      return
    }
    saveCheckPrefs(id, {
      cameraId: media.cameraId,
      microphoneId: media.microphoneId,
      speech: textOnlyMode ? 'off' : 'on',
      analysis: useAnalysis ? 'on' : 'off',
      baseline: useAnalysis ? baseline : undefined,
    })
    abortRef.current?.abort()
    cancelSpeech()
    navigate(`/interviews/${id}/run`)
  }

  const remaining = [
    !cameraOk && '카메라',
    !micOk && '마이크 소리',
    !soundOk && '음성 출력',
    !baselineOk && '기준 자세 측정',
    !consent && '안내 동의',
  ]
    .filter(Boolean)
    .join(', ')
  const guide = noVoice ? getVoiceInstallGuide() : null

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Alert>{loadError}</Alert>
        <Link to="/interviews" className={buttonClass({ variant: 'outline' }, 'mt-4')}>
          면접 목록으로
        </Link>
      </div>
    )
  }

  if (interview?.status === 'COMPLETED') {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="p-6">
          <p className="font-medium">이미 끝난 면접이에요.</p>
          <p className="mt-1 text-sm text-muted-foreground">끝난 면접은 다시 시작할 수 없습니다. 같은 조건으로 새 면접을 만들어 연습해 보세요.</p>
          <div className="mt-4 flex gap-2">
            <Link to={`/interviews/${interview.id}`} className={buttonClass({ variant: 'outline' })}>
              면접 상세로
            </Link>
            <RetryInterviewButton interviewId={interview.id} variant="primary" />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-2" aria-label="진행 단계">
          <Step number={1} label="질문 구성 완료" state="done" />
          <Step number={2} label="장치 점검" state="current" />
          <Step number={3} label="실전 모의 면접" state="todo" />
        </ol>
        {interview && <Badge variant="outline">{interview.title}</Badge>}
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Icon name="videocam" size={18} />
        카메라·마이크·소리 점검
      </p>
      <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">면접 전 환경 점검</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        실제 면접과 같은 환경에서 시작할 수 있도록 카메라, 마이크, 소리를 확인합니다. 영상은 이 브라우저 안에서만 쓰이고 서버로 전송되지 않습니다.
      </p>

      <div className="mt-6">
        <ConsentNotice checked={consent} onChange={setConsent} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* 왼쪽: 카메라 */}
        <div className="space-y-4 lg:col-span-7">
          {media.status === 'error' && media.failure ? (
            <MediaFailurePanel failure={media.failure} onRetry={() => void media.retry()} retrying={busy} />
          ) : (
            <>
              <CameraPreview
                stream={media.stream}
                loading={busy || media.status === 'idle'}
                settings={media.videoSettings}
                videoRef={videoRef}
              />
              {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                  카메라·마이크 권한을 요청하고 있어요. 브라우저 주소창 근처에 나타나는 창에서 &quot;허용&quot;을 눌러 주세요.
                </p>
              )}
            </>
          )}
          <Card>
            <CardTitle icon="accessibility_new" aside={baseline ? '측정 완료' : undefined}>
              기준 자세 측정
            </CardTitle>
            {analysisUnavailable ? (
              <div role="status" className="rounded-control bg-warning/10 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-warning">
                  <Icon name="cloud_off" size={18} />
                  표정·자세 분석을 쓸 수 없어요
                </p>
                <p className="mt-1 text-muted-foreground">{analysis.error}</p>
                <p className="mt-1 text-muted-foreground">
                  <strong className="text-foreground">분석 없이 면접을 진행할 수 있어요.</strong> 답변 내용과 말하기 분석은 그대로 받을 수 있고, 시선·자세·표정 지표만 빠집니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  편한 자세로 바르게 앉아 카메라 렌즈를 바라보세요. {BASELINE_SECONDS}초 동안 지금의 시선과 자세를 기준으로 기록해 두고, 면접 중에는 이 기준과 비교해서 분석합니다.
                </p>
                <div className="flex flex-wrap gap-2" aria-label="인식 상태">
                  <Badge variant={analysis.presence.face ? 'success' : 'muted'}>
                    <Icon name={analysis.presence.face ? 'check_circle' : 'face'} size={16} />
                    얼굴 {analysis.presence.face ? '인식됨' : '인식 안 됨'}
                  </Badge>
                  <Badge variant={analysis.presence.shoulders ? 'success' : 'muted'}>
                    <Icon name={analysis.presence.shoulders ? 'check_circle' : 'accessibility_new'} size={16} />
                    어깨 {analysis.presence.shoulders ? '보임' : '안 보임'}
                  </Badge>
                  {analysis.status === 'loading' && (
                    <Badge variant="muted">
                      <Icon name="progress_activity" size={16} className="animate-spin" />
                      분석 모델 불러오는 중...
                    </Badge>
                  )}
                </div>
                {measuring ? (
                  <div role="status">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-100" style={{ width: `${Math.round((measureProgress ?? 0) * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium">움직이지 말고 정면을 바라보세요... {Math.max(0, Math.ceil(BASELINE_SECONDS * (1 - (measureProgress ?? 0))))}초</p>
                  </div>
                ) : (
                  <Button
                    variant={baseline ? 'outline' : 'primary'}
                    onClick={() => void startMeasure()}
                    disabled={analysis.status !== 'running' || !permissionOk}
                  >
                    <Icon name={baseline ? 'refresh' : 'play_circle'} />
                    {baseline ? '다시 측정하기' : `기준 자세 측정 (${BASELINE_SECONDS}초)`}
                  </Button>
                )}
                {measureFailure && (
                  <Alert>
                    {measureFailure === 'no-face'
                      ? '얼굴이 잘 보이지 않았어요. 카메라 정면에서 얼굴 전체가 보이도록 앉아 다시 측정해 주세요.'
                      : '분석이 아직 시작되지 않았어요. 잠시 후 다시 시도해 주세요.'}
                  </Alert>
                )}
                {baseline && !measuring && (
                  <p className="flex items-start gap-1.5 rounded-control bg-success/10 p-3 text-sm">
                    <Icon name="check_circle" size={18} className="mt-px text-success" />
                    <span>
                      기준 자세를 기록했어요.
                      {!baseline.poseAvailable && (
                        <span className="mt-0.5 block text-muted-foreground">
                          어깨가 화면에 보이지 않아 자세·손 동작 지표는 쓰지 않아요. 어깨까지 보이게 앉아 다시 측정하면 함께 분석할 수 있어요.
                        </span>
                      )}
                    </span>
                  </p>
                )}
              </div>
            )}
          </Card>
          <Card className="flex items-start gap-3 bg-accent/40 p-4 shadow-none">
            <Icon name="wb_sunny" size={22} className="mt-0.5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">조명과 구도 안내</p>
              <p className="mt-0.5 text-muted-foreground">
                얼굴에 그림자가 지지 않게 밝은 곳에서, 카메라 렌즈를 바라보며 어깨까지 화면에 보이도록 앉아 주세요. 미리보기는 거울처럼 좌우가 반전되어
                보이지만 분석에는 원본 영상이 쓰입니다.
              </p>
            </div>
          </Card>
        </div>

        {/* 오른쪽: 장치, 마이크, 소리, 체크리스트 */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardTitle icon="tune" aside={media.status === 'ready' ? `카메라 ${media.cameras.length}개 · 마이크 ${media.microphones.length}개` : undefined}>
              입출력 장치 선택
            </CardTitle>
            <div className="space-y-4">
              <SelectField
                label="카메라"
                name="camera"
                value={media.cameraId ?? ''}
                disabled={busy || media.cameras.length === 0}
                onChange={(e) => void media.selectCamera(e.target.value)}
              >
                {media.cameras.length === 0 && <option value="">사용할 수 있는 카메라가 없어요</option>}
                {media.cameras.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="마이크"
                name="microphone"
                value={media.microphoneId ?? ''}
                disabled={busy || media.microphones.length === 0}
                onChange={(e) => void media.selectMicrophone(e.target.value)}
              >
                {media.microphones.length === 0 && <option value="">사용할 수 있는 마이크가 없어요</option>}
                {media.microphones.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `마이크 ${i + 1}`}
                  </option>
                ))}
              </SelectField>
              <p className="text-xs text-muted-foreground">스피커·헤드폰 출력은 운영체제(또는 브라우저)의 소리 설정을 따릅니다.</p>
            </div>
          </Card>

          <Card>
            <CardTitle icon="graphic_eq">마이크 소리 확인</CardTitle>
            <MicLevelMeter level={audio.level} detected={audio.detected} suspended={audio.suspended} disabled={!permissionOk} />
            <p className="mt-3 flex items-start gap-2 rounded-control bg-muted p-3 text-sm text-muted-foreground">
              <Icon name="record_voice_over" size={18} className="mt-0.5 text-primary" />
              마이크를 향해 평소 목소리로 &quot;안녕하세요, 잘 들리나요?&quot; 하고 말해 보세요. 막대가 표시선을 넘으면 통과예요.
            </p>
          </Card>

          <Card>
            <CardTitle icon="hearing" aside={test === 'done' ? '재생 완료' : undefined}>
              음성 출력 테스트
            </CardTitle>
            {koreanVoice.loading ? (
              <p className="text-sm text-muted-foreground">사용할 수 있는 목소리를 확인하는 중...</p>
            ) : noVoice && guide ? (
              <div role="status" className="rounded-control bg-warning/10 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-warning">
                  <Icon name="volume_off" size={18} />
                  {koreanVoice.supported ? '한국어 목소리를 찾지 못했어요' : '이 브라우저는 음성 읽기를 지원하지 않아요'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  질문을 소리로 읽어 줄 수 없어서 <strong className="text-foreground">화면의 텍스트로만 진행</strong>됩니다. 질문을 듣고 싶다면
                  아래 방법으로 한국어 목소리를 설치해 보세요.
                </p>
                <details className="mt-2" open>
                  <summary className="cursor-pointer font-medium">{guide.os} 에서 한국어 목소리 설치하기</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                    {guide.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  &quot;{TEST_SENTENCE}&quot;를 읽어 줍니다. 소리가 들리는지 확인하세요.
                  {koreanVoice.voice && <span className="mt-1 block text-xs">목소리: {koreanVoice.voice.name}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {test === 'speaking' ? (
                    <Button variant="outline" onClick={stopTest}>
                      <Icon name="stop_circle" />
                      읽기 중지
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => void playTest()} disabled={textOnly}>
                      <Icon name={test === 'done' ? 'replay' : 'play_circle'} className="text-primary" />
                      {test === 'done' ? '다시 들어 보기' : '테스트 재생'}
                    </Button>
                  )}
                  {test === 'speaking' && <span className="text-sm text-muted-foreground">읽는 중...</span>}
                </div>
                {test === 'failed' && (
                  <Alert>
                    소리를 재생하지 못했어요. 컴퓨터 볼륨과 출력 장치를 확인한 뒤 다시 눌러 보세요. 계속 안 되면 아래에서 텍스트로만 진행할 수 있어요.
                  </Alert>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={textOnly}
                    onChange={(e) => {
                      if (e.target.checked) {
                        abortRef.current?.abort()
                        cancelSpeech()
                      }
                      setTextOnly(e.target.checked)
                    }}
                    className="size-4 accent-primary"
                  />
                  소리 없이 질문을 텍스트로만 볼게요
                </label>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-heading text-base font-bold">최종 점검 체크리스트</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              <CheckItem ok={permissionOk} label="브라우저 권한 허용" hint={permissionOk ? undefined : '카메라와 마이크 사용을 허용해 주세요'} />
              <CheckItem
                ok={Boolean(cameraOk)}
                label="카메라 화면 표시"
                hint={cameraOk && media.videoSettings ? `${media.videoSettings.width}×${media.videoSettings.height}` : undefined}
              />
              <CheckItem ok={micOk} label="마이크 소리 감지" hint={micOk ? undefined : '마이크에 대고 말해 보세요'} />
              <CheckItem
                ok={baselineOk}
                label={analysisUnavailable ? '표정·자세 분석 없이 진행' : '기준 자세 측정'}
                hint={baselineOk ? undefined : '바르게 앉아 기준 자세를 측정해 주세요'}
              />
              <CheckItem ok={consent} label="안내 내용 동의" hint={consent ? undefined : '위 안내를 읽고 동의해 주세요'} />
              <CheckItem
                ok={soundOk}
                label={textOnlyMode ? '질문은 텍스트로만 진행' : '음성 출력 확인'}
                hint={soundOk ? undefined : '테스트 재생으로 소리를 확인하세요'}
              />
            </ul>
          </Card>
        </div>
      </div>

      {/* 아래: 준비 완료 */}
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className={cn('flex size-11 items-center justify-center rounded-full', allOk ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
            <Icon name={allOk ? 'verified_user' : 'pending'} size={24} />
          </span>
          <div>
            <p className="font-heading text-lg font-bold">{allOk ? '면접 준비가 모두 끝났어요' : '아직 확인이 필요한 항목이 있어요'}</p>
            <p className="text-sm text-muted-foreground">
              {allOk ? '편안한 마음으로 시작하세요. 시작하면 첫 질문이 나옵니다.' : `남은 항목: ${remaining}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/interviews/${id}`} className={buttonClass({ variant: 'ghost' })}>
            면접 상세로
          </Link>
          {/* 권한 창을 놓쳐 요청이 끝나지 않는 경우에도 다시 요청할 수 있도록 요청 중에도 누를 수 있게 둡니다. */}
          <Button variant="outline" onClick={() => void media.retry()}>
            <Icon name="refresh" />
            다시 측정하기
          </Button>
          <Button size="lg" onClick={() => void handleReady()} disabled={!allOk || busy || starting}>
            {starting ? '시작하는 중...' : '준비 완료'}
            <Icon name="arrow_forward" />
          </Button>
        </div>
      </Card>
      {startError && (
        <div className="mt-4">
          <Alert>{startError}</Alert>
        </div>
      )}
    </div>
  )
}
