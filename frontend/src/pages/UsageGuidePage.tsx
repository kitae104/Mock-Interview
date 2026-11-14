import { CheckList, GuideCta, GuideHeader, GuideSection } from '../components/GuideLayout.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { site } from '../config/site.ts'

// 사이트 이용 가이드 (docs/PLAN.md 1.3 UsageGuidePage). 화면 동작을 바꾸면 이 문구도 함께 고칩니다.

const toc = [
  { id: 'env', label: '이용 환경' },
  { id: 'steps', label: '이용 순서' },
  { id: 'trouble', label: '자주 겪는 문제' },
]

const envItems = [
  '데스크톱(노트북) Chrome 또는 Edge 브라우저를 권장합니다. 모바일 화면은 아직 맞춰져 있지 않습니다.',
  '웹캠과 마이크가 필요합니다. 표정·자세 분석을 끄면 마이크만으로도 진행할 수 있습니다.',
  '카메라·마이크는 localhost 또는 HTTPS 주소에서만 동작합니다.',
  '질문 생성과 피드백에 AI 를 사용하므로 인터넷 연결이 필요합니다.',
  '질문 5개 기준으로 점검을 포함해 15분 정도 여유 있게 시작하세요.',
]

const steps = [
  {
    icon: 'person_add',
    title: '회원가입·로그인',
    description: '오른쪽 위 [회원가입] 으로 계정을 만들고 로그인합니다. 면접 기록은 내 계정에만 저장됩니다.',
  },
  {
    icon: 'edit_note',
    title: '새 면접 만들기',
    description:
      '[모의 면접] → [새 면접 만들기] 에서 분야(예: 백엔드 개발자), 수준(신입/경력), 질문 수(3~10개), 생각할 시간(0·10·30초)을 고르고 채용 공고가 있으면 붙여 넣습니다. [질문 만들기] 를 누르면 10~30초 뒤 질문이 준비됩니다.',
    tip: '채용 공고는 AI 제공자에게 전송되니 기밀 정보는 빼고 넣으세요.',
  },
  {
    icon: 'list_alt',
    title: '질문 확인',
    description: '면접 상세 화면에서 만들어진 질문 목록을 미리 볼 수 있습니다. 준비가 되면 [면접 시작] 을 누릅니다.',
  },
  {
    icon: 'settings_input_component',
    title: '카메라·마이크 점검',
    description:
      '안내를 읽고 동의한 뒤 마이크 입력, 질문 읽기 소리, 카메라 얼굴 인식을 차례로 확인합니다. 마지막으로 바른 자세로 3초 동안 기준 자세를 측정합니다.',
    tip: '"표정·자세 분석" 을 끄면 카메라를 쓰지 않고 진행합니다.',
  },
  {
    icon: 'radio_button_checked',
    title: '면접 진행',
    description:
      '[질문 듣기 시작] 을 누르면 질문을 읽어 줍니다. 생각할 시간이 지나면 녹음이 시작되고, 답변을 마치면 [답변 완료] 를 누릅니다. 답변은 질문당 최대 2분이며 시간이 다 되면 자동으로 끝납니다.',
    tip: '질문은 화면에도 항상 표시되고, [소리 끄기] 로 읽기를 끌 수 있습니다.',
  },
  {
    icon: 'assignment',
    title: '결과 리포트',
    description:
      '마지막 질문이 끝나면 결과 화면에서 답변별 피드백과 종합 리포트가 만들어집니다. 총점, 강점·개선점, 말하기·자세 지표, 개선 답변 예시를 확인하세요.',
  },
  {
    icon: 'monitoring',
    title: '기록·대시보드·면접 코치',
    description:
      '[대시보드] 에서 점수 추이를, [모의 면접] 목록에서 지난 면접을 다시 볼 수 있습니다. 결과 화면의 [같은 조건으로 다시 연습] 으로 반복 연습하고, 궁금한 점은 [면접 코치에게 묻기] 에서 물어보세요.',
  },
  {
    icon: 'work',
    title: '취업 도우미 (이력서·자기소개서·포트폴리오)',
    description:
      '[취업 도우미] 에서 이력서를 섹션별로 쓰고 지원 직무 기준 AI 첨삭을 받거나, 자기소개서 문항별로 경험 메모를 적어 AI 초안·첨삭을 받을 수 있습니다. 포트폴리오에 프로젝트를 정리하면 설명 다듬기와 그 프로젝트로 받을 만한 예상 면접 질문을 만들어 줍니다.',
    tip: 'AI 제안은 [적용] 을 눌러야 본문에 들어가고, 이름·연락처·링크는 AI 로 보내지 않습니다.',
  },
]

const troubles = [
  {
    q: '카메라·마이크 권한 창을 놓쳤거나 "차단" 을 눌렀어요',
    a: '주소창 왼쪽의 자물쇠(사이트 정보) 아이콘에서 카메라·마이크를 "허용" 으로 바꾼 뒤 새로고침하세요. 다른 프로그램(화상 회의 등)이 카메라를 쓰고 있으면 먼저 종료하세요.',
  },
  {
    q: '질문을 읽어 주는 소리가 나지 않아요',
    a: '브라우저·운영체제에 한국어 음성이 없으면 소리가 나지 않을 수 있습니다. 이때도 질문이 화면에 표시되므로 면접은 그대로 진행할 수 있습니다.',
  },
  {
    q: '얼굴이 인식되지 않아요',
    a: '얼굴 정면에 조명을 두고, 카메라 렌즈를 바라보며 머리부터 어깨까지 화면에 들어오게 앉아 주세요.',
  },
  {
    q: '답변 업로드가 실패했어요',
    a: '녹음은 브라우저에 남아 있으니 [다시 보내기] 를 눌러 주세요. 실패한 답변은 서버에 저장되지 않으므로 다시 보내도 중복되지 않습니다.',
  },
  {
    q: '면접 중에 새로고침하거나 창을 닫았어요',
    a: '진행 중이던 질문의 녹음은 사라집니다. 면접 기록에서 [이어하기] 를 누르면 점검을 다시 한 뒤 답하지 않은 첫 질문부터 이어집니다.',
  },
  {
    q: '면접 기록을 지우고 싶어요',
    a: '면접 기록 목록이나 상세 화면에서 삭제할 수 있습니다. 질문, 답변 텍스트, 지표, 리포트가 모두 지워지고 복구할 수 없습니다.',
  },
]

export default function UsageGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <GuideHeader
        eyebrow="이용 가이드"
        title={`${site.name} 사용 방법`}
        description="처음 이용한다면 아래 순서대로 따라 해 보세요. 면접 하나를 만드는 데부터 결과 리포트를 확인하기까지의 과정을 단계별로 안내합니다."
        toc={toc}
      />

      <GuideSection id="env" icon="computer" title="이용 환경">
        <Card className="p-6">
          <CheckList items={envItems} />
        </Card>
      </GuideSection>

      <GuideSection id="steps" icon="route" title="이용 순서">
        <ol className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className="flex gap-4 p-5">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Icon name={s.icon} size={22} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                  {s.tip && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-control bg-muted p-3 text-sm">
                      <Icon name="lightbulb" size={18} className="mt-0.5 shrink-0 text-primary" />
                      {s.tip}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </GuideSection>

      <GuideSection id="trouble" icon="help" title="자주 겪는 문제">
        <div className="flex flex-col gap-3">
          {troubles.map((t) => (
            <details key={t.q} className="group rounded-card border border-border bg-card p-5 shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {t.q}
                <Icon name="expand_more" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.a}</p>
            </details>
          ))}
        </div>
      </GuideSection>

      <GuideCta title="이제 첫 모의 면접을 시작해 보세요" description="면접 준비 가이드에서 직무별 주제와 복장도 함께 확인할 수 있습니다." />
    </div>
  )
}
