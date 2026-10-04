import Card from '../ui/Card.tsx'
import Icon from '../ui/Icon.tsx'

// docs/PLAN.md 7.4 의 안내 문구. 문구를 바꾸면 백엔드 INTERVIEW_CONSENT_VERSION 도 함께 올려야 합니다.
const NOTICES = [
  '카메라 영상은 이 컴퓨터의 브라우저 안에서만 분석되며 서버로 전송·저장되지 않습니다. 서버에는 "시선·자세·표정" 같은 요약 숫자만 전송됩니다. (분석을 쓰지 않으면 이 숫자도 보내지 않습니다.)',
  '답변 음성은 텍스트로 바꾸기 위해 음성 인식 서비스(OpenAI, 해외 서버)로 전송(국외 이전)되며, 우리 서버에는 저장되지 않습니다.',
  '인식된 답변 텍스트와 지표는 AI 피드백을 만들기 위해 AI 서비스 제공자에게 전송되고, 내 기록으로 저장됩니다. 기록은 언제든 삭제할 수 있습니다.',
  '표정·시선·자세 지표는 카메라 영상으로 추정한 참고값이며 정확하지 않을 수 있습니다. 점수에 미치는 비중이 작고, 합격 여부를 예측하지 않습니다.',
  '민감한 개인정보(주민등록번호, 실명 연락처 등)는 답변에 말하지 마세요. 전화번호·주민등록번호·이메일·카드번호처럼 보이는 숫자·문장은 저장 전에 자동으로 가려지지만 완벽하지 않습니다.',
  '이 동의는 면접마다 기록됩니다(동의 시각, 안내 문구 버전).',
]

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
}

export default function ConsentNotice({ checked, onChange }: Props) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-bold">
        <Icon name="privacy_tip" size={20} className="text-primary" />
        면접 연습을 시작하기 전에 확인해 주세요
      </h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {NOTICES.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-control bg-accent/40 px-3 py-2.5 text-sm font-medium">
        <input
          type="checkbox"
          name="consent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-primary"
        />
        위 내용을 확인했고 동의합니다
      </label>
    </Card>
  )
}
