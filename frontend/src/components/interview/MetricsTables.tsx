import type { NonverbalResult, SpeechResult, Verdict, VerdictLevel } from '../../api/interviews.ts'
import { cn } from '../../lib/cn.ts'
import Badge from '../ui/Badge.tsx'
import type { BadgeVariant } from '../ui/styles.ts'

// 한 답변의 말하기·비언어 지표 표: 값, 기준 범위, 판정. 기준 범위와 판정은 서버가 계산해 보내 줍니다 (thresholds.py 한 곳).

const verdictVariant: Record<VerdictLevel, BadgeVariant> = {
  GOOD: 'success',
  FAIR: 'warning',
  POOR: 'danger',
  NA: 'muted',
}

export function VerdictBadge({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return null
  return (
    <Badge variant={verdictVariant[verdict.level]} className="whitespace-nowrap">
      {verdict.label}
    </Badge>
  )
}

const fmt = (value: number | null | undefined, unit = '', digits = 1) =>
  value === null || value === undefined ? '—' : `${Number(value.toFixed(digits))}${unit}`
const percent = (ratio: number | null | undefined) => fmt(ratio === null || ratio === undefined ? null : ratio * 100, '%', 0)

interface Row {
  label: string
  value: string
  verdict?: Verdict
  /** 판정이 없는 참고 항목 */
  note?: string
}

function MetricsTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={caption}>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              지표
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              값
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              기준 범위
            </th>
            <th scope="col" className="py-1.5 font-medium">
              판정
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted-foreground">
                {row.label}
              </th>
              <td className="py-1.5 pr-3 font-mono font-semibold">{row.value}</td>
              <td className={cn('py-1.5 pr-3', !row.verdict?.reference && 'text-muted-foreground')}>
                {row.verdict?.reference ?? '—'}
              </td>
              <td className="py-1.5">{row.verdict ? <VerdictBadge verdict={row.verdict} /> : <span className="text-xs text-muted-foreground">{row.note}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SpeechMetricsTable({ speech }: { speech: SpeechResult }) {
  const { metrics: m, verdicts: v } = speech
  const fillers = Object.entries(m.fillerBreakdown)
  const rows: Row[] = [
    { label: '분당 음절 수(말하기 속도)', value: fmt(m.syllablesPerMinute, '', 0), verdict: v.pace },
    { label: '답변 시간', value: `${fmt(m.answerSeconds, '초')} (최대 ${m.maxAnswerSeconds}초)`, verdict: v.duration },
    { label: '첫 발화까지', value: fmt(m.firstSpeechSeconds, '초'), verdict: v.firstSpeech },
    {
      label: '2초 이상 침묵',
      value: `${m.silenceCount}회 · 합 ${fmt(m.silenceTotalSeconds, '초')} · 최대 ${fmt(m.longestSilenceSeconds, '초')}`,
      verdict: v.silence,
    },
    {
      label: '군말 (인식된 텍스트 기준)',
      value: `${m.fillerCount}회${fillers.length > 0 ? ` (${fillers.map(([word, count]) => `${word} ${count}`).join(', ')})` : ''} · 분당 ${fmt(m.fillerPerMinute)}`,
      verdict: v.filler,
    },
    { label: '단어 / 음절', value: `${m.wordCount}개 / ${m.syllableCount}음절`, note: '참고' },
  ]
  return <MetricsTable caption="말하기 지표" rows={rows} />
}

/** 비언어 지표는 카메라 영상으로 추정한 참고값입니다. */
export function NonverbalMetricsTable({ nonverbal }: { nonverbal: NonverbalResult }) {
  const m = nonverbal.metrics
  const v = nonverbal.verdicts
  const rows: Row[] = [
    { label: '얼굴이 보인 비율', value: percent(m.faceVisibleRatio), verdict: v.faceVisible },
    { label: '카메라 응시 비율', value: percent(m.gazeAtCameraRatio), verdict: v.gaze },
    { label: '머리 움직임', value: fmt(m.headMotionDegPerSec, '도/초'), verdict: v.headMotion },
    { label: '어깨 기울기 (기준 대비)', value: fmt(m.shoulderTiltDeg, '도'), verdict: v.shoulderTilt },
    { label: '자세가 흐트러진 비율', value: percent(m.postureCollapseRatio), verdict: v.posture },
    { label: '손 움직임', value: fmt(m.handMotionIndex, '어깨폭/초'), verdict: v.handMotion },
    { label: '미소 비율', value: percent(m.smileRatio), verdict: v.smile },
    { label: '분당 눈 깜빡임', value: fmt(m.blinksPerMinute, '회'), verdict: v.blink },
    { label: '분당 손 제스처', value: fmt(m.gesturesPerMinute, '회'), verdict: v.gesture },
  ]
  return (
    <div>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        자세·표정 지표는 카메라 영상으로 추정한 참고값입니다.
        {nonverbal.reliable ? (
          <Badge variant="success">참고할 수 있음</Badge>
        ) : (
          <Badge variant="warning">얼굴이 충분히 보이지 않아 점수에서는 제외돼요</Badge>
        )}
      </p>
      <MetricsTable caption="비언어 지표 (참고값)" rows={rows} />
      <p className="mt-1 text-xs text-muted-foreground">
        분석 {fmt(m.analysisSeconds, '초')} · 충족률 {percent(m.sampleCoverage)} · 점수에는 얼굴·응시·머리·어깨·자세·손 움직임만 쓰고,
        미소·눈 깜빡임·손 제스처는 보여 주기만 해요.
      </p>
    </div>
  )
}
