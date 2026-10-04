import { useCallback, useEffect, useRef, useState } from 'react'
import type { InterviewDetail, QuestionDto } from '../../api/interviews.ts'
import type { NonverbalAnalyzer } from './analyzer/NonverbalAnalyzer.ts'
import { summarizeSamples } from './analyzer/summarize.ts'
import type { Baseline, NonverbalMetrics } from './analyzer/types.ts'
import { AnswerRecorder } from './recorder.ts'
import { cancelSpeech, speak } from './speech.ts'

/**
 * 면접 진행의 단계 (docs/PLAN.md 8장 ⑤). 질문마다 아래 순서를 반복합니다.
 *
 *   gate(시작 버튼) → speaking(질문 읽기) → thinking(생각할 시간, 0초면 건너뜀) → countdown(3·2·1) → recording(답변) → 다음 질문
 *   마지막 질문의 답변이 끝나면 finishing(전송이 모두 끝나길 기다렸다가 면접 종료)
 */
export type RunPhase = 'gate' | 'speaking' | 'thinking' | 'countdown' | 'recording' | 'finishing'

/** 녹음이 끝난 한 답변. 업로드는 대기열이 뒤에서 처리합니다. */
export interface RecordedAnswer {
  audio: Blob
  durationMs: number
  /** 분석을 쓴 경우 이 답변을 하는 동안의 시선·자세·표정 요약. 아니면 null */
  nonverbal: NonverbalMetrics | null
}

/** 질문을 다 읽은 뒤 녹음이 시작되기까지의 카운트다운(초) */
export const COUNTDOWN_SECONDS = 3

interface Options {
  interview: InterviewDetail
  stream: MediaStream | null
  analyzer: NonverbalAnalyzer
  /** 분석을 쓸 때의 기준 자세. null 이면 분석 없이 진행합니다. */
  baseline: Baseline | null
  /** 분석기가 지금 돌고 있는지 (모델을 못 불러왔다면 false) */
  analysisRunning: boolean
  /** 질문을 소리로 읽을지. false 면 화면 텍스트로만 진행합니다. */
  speechOn: boolean
  voice: SpeechSynthesisVoice | null
  /** 한 답변의 녹음이 끝날 때마다 부릅니다 (업로드 대기열에 넣는 곳). */
  onRecorded: (questionId: number, answer: RecordedAnswer) => void
}

/**
 * 면접 진행 화면의 흐름을 관리합니다: 질문 읽기, 생각할 시간, 카운트다운, 녹음과 비언어 분석, 다음 질문.
 * 화면을 떠나면(언마운트) 읽던 소리와 녹음을 모두 멈춥니다. 카메라·마이크·분석기는 각자의 훅이 닫습니다.
 */
export function useInterviewRun(options: Options) {
  const { interview } = options
  const questions = interview.questions
  // 이어하기: 이미 답한 질문은 건너뛰고 첫 번째 미답변 질문부터. 모두 답했다면 바로 마무리 단계.
  const firstUnanswered = questions.findIndex((q) => q.answer === null)

  const [phase, setPhase] = useState<RunPhase>(firstUnanswered === -1 ? 'finishing' : 'gate')
  const [index, setIndex] = useState(Math.max(firstUnanswered, 0))
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [thinkLeft, setThinkLeft] = useState(interview.prepSeconds)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [replayKey, setReplayKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [speechFailed, setSpeechFailed] = useState(false)
  const recorderRef = useRef<AnswerRecorder | null>(null)

  // 콜백 안에서 항상 최신 값을 읽기 위해 ref 에 담아 둡니다.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const prepSeconds = interview.prepSeconds
  const current: QuestionDto | undefined = questions[index]

  const toCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS)
    setPhase('countdown')
  }, [])

  const beginRecording = useCallback((question: QuestionDto, isLast: boolean) => {
    const { stream, analyzer, baseline, analysisRunning, interview: run } = latest.current
    if (!stream) {
      setError('마이크가 준비되지 않았어요. 카메라·마이크를 확인한 뒤 다시 시작해 주세요.')
      return setPhase('gate')
    }
    let recorder: AnswerRecorder
    try {
      recorder = new AnswerRecorder(stream)
    } catch (err) {
      setError(err instanceof Error ? err.message : '녹음을 시작하지 못했어요.')
      return setPhase('gate')
    }
    recorderRef.current = recorder
    // 분석은 계속 돌고 있으므로, 녹음을 시작하는 시점의 프레임 번호부터 끝날 때까지를 이 답변의 구간으로 씁니다.
    const sampleStart = baseline && analysisRunning && analyzer.isRunning ? analyzer.sampleCount : null
    setElapsedMs(0)
    setError(null)
    try {
      recorder.start({ maxSeconds: run.maxAnswerSeconds, onTick: setElapsedMs })
    } catch (err) {
      // MediaRecorder 를 시작하지 못함: 녹음 중 화면에 갇히지 않게 시작 화면으로 돌아갑니다.
      recorderRef.current = null
      recorder.cancel()
      setError(err instanceof Error ? err.message : '녹음을 시작하지 못했어요.')
      return setPhase('gate')
    }
    setPhase('recording')

    recorder.result.then(
      (recording) => {
        if (recorderRef.current !== recorder) return // 화면을 떠나면서 취소된 녹음
        recorderRef.current = null
        if (recording.blob.size === 0) {
          // 소리가 하나도 녹음되지 않음: 같은 질문을 다시 합니다.
          setError('녹음된 소리가 없어요. 마이크를 확인한 뒤 다시 답변해 주세요.')
          setReplayKey((k) => k + 1)
          return setPhase('speaking')
        }
        const nonverbal =
          baseline && sampleStart !== null
            ? summarizeSamples(analyzer.samplesSince(sampleStart), baseline, { durationSeconds: recording.durationMs / 1000 })
            : null
        latest.current.onRecorded(question.id, { audio: recording.blob, durationMs: recording.durationMs, nonverbal })
        if (isLast) return setPhase('finishing')
        setIndex((i) => i + 1)
        setPhase('speaking')
      },
      (err: unknown) => {
        if (recorderRef.current !== recorder) return
        recorderRef.current = null
        setError(err instanceof Error ? err.message : '녹음에 실패했어요.')
        setPhase('gate')
      },
    )
  }, [])

  // 1) 질문 읽기: 읽기가 끝나면 생각할 시간(없으면 카운트다운)으로. 소리를 쓰지 않으면 잠깐 보여 준 뒤 넘어갑니다.
  useEffect(() => {
    if (phase !== 'speaking' || !current) return
    const { speechOn, voice } = latest.current
    let cancelled = false
    const proceed = () => {
      if (cancelled) return
      if (prepSeconds > 0) {
        setThinkLeft(prepSeconds)
        setPhase('thinking')
      } else {
        toCountdown()
      }
    }
    if (!speechOn || !voice) {
      const timer = window.setTimeout(proceed, 800)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }
    const controller = new AbortController()
    speak(current.text, { voice, signal: controller.signal }).then(
      (result) => result === 'ended' && proceed(),
      () => {
        if (cancelled) return
        setSpeechFailed(true) // 소리를 낼 수 없는 환경: 텍스트로 계속 진행합니다.
        proceed()
      },
    )
    return () => {
      cancelled = true
      controller.abort()
      cancelSpeech()
    }
  }, [phase, current, replayKey, prepSeconds, toCountdown])

  // 2) 생각할 시간
  useEffect(() => {
    if (phase !== 'thinking') return
    let left = prepSeconds
    const timer = window.setInterval(() => {
      left -= 1
      if (left <= 0) {
        window.clearInterval(timer)
        toCountdown()
      } else {
        setThinkLeft(left)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase, index, replayKey, prepSeconds, toCountdown])

  // 3) 3·2·1 카운트다운 뒤에 녹음 시작
  useEffect(() => {
    if (phase !== 'countdown' || !current) return
    const isLast = index === questions.length - 1
    let left = COUNTDOWN_SECONDS
    const timer = window.setInterval(() => {
      left -= 1
      if (left <= 0) {
        window.clearInterval(timer)
        beginRecording(current, isLast)
      } else {
        setCountdown(left)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase, index, current, questions.length, beginRecording])

  // 화면을 떠나면 읽던 소리와 녹음을 버립니다.
  useEffect(
    () => () => {
      const recorder = recorderRef.current
      recorderRef.current = null
      recorder?.cancel()
      cancelSpeech()
    },
    [],
  )

  const begin = useCallback(() => {
    setError(null)
    setPhase('speaking')
  }, [])

  const skipThinking = useCallback(() => {
    if (phase === 'thinking') toCountdown()
  }, [phase, toCountdown])

  /** 질문 다시 듣기: 녹음을 시작하기 전(읽는 중, 생각할 시간, 카운트다운)에만 됩니다. */
  const replay = useCallback(() => {
    if (phase !== 'speaking' && phase !== 'thinking' && phase !== 'countdown') return
    setReplayKey((k) => k + 1)
    setPhase('speaking')
  }, [phase])

  /** "답변 완료": 녹음을 끝냅니다. 이후 처리는 beginRecording 이 이어받습니다. */
  const finishAnswer = useCallback(() => {
    void recorderRef.current?.stop()
  }, [])

  return {
    phase,
    index,
    total: questions.length,
    question: current,
    isLast: index === questions.length - 1,
    countdown,
    thinkLeft,
    elapsedMs,
    error,
    speechFailed,
    canReplay: phase === 'speaking' || phase === 'thinking' || phase === 'countdown',
    begin,
    skipThinking,
    replay,
    finishAnswer,
  }
}
