import { CheckList, GuideCta, GuideHeader, GuideSection } from '../components/GuideLayout.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'

// 면접 준비 가이드 (docs/PLAN.md 1.3 InterviewGuidePage). 컴퓨터·IT·소프트웨어 직무 기준의 일반적인 준비 정보입니다.

const toc = [
  { id: 'roles', label: '직무별 준비 주제' },
  { id: 'types', label: '면접 유형' },
  { id: 'prepare', label: '준비물' },
  { id: 'dress', label: '복장' },
  { id: 'online', label: '화상 면접 환경' },
  { id: 'answer', label: '답변 요령' },
  { id: 'dday', label: '당일 체크리스트' },
]

const roles = [
  {
    icon: 'web',
    title: '프론트엔드',
    topics: ['브라우저 렌더링 과정', 'HTML·CSS 레이아웃', 'JavaScript 비동기·이벤트 루프', 'React 상태 관리', '웹 성능·접근성'],
  },
  {
    icon: 'dns',
    title: '백엔드',
    topics: ['HTTP·REST API 설계', '데이터베이스 인덱스·트랜잭션', '인증·인가(JWT, 세션)', '캐시', '동시성·장애 대응'],
  },
  {
    icon: 'smartphone',
    title: '모바일',
    topics: ['앱 생명주기', '메모리 관리', '비동기·스레드', '오프라인 저장', '배포·스토어 심사'],
  },
  {
    icon: 'database',
    title: '데이터·AI',
    topics: ['SQL·데이터 모델링', '데이터 파이프라인(ETL)', '모델 평가 지표', '과적합·데이터 누수', '모델 서빙'],
  },
  {
    icon: 'cloud',
    title: 'DevOps·클라우드',
    topics: ['Linux·네트워크 기초', '컨테이너·Docker', 'CI/CD', '모니터링·로그', '클라우드 비용·보안 설정'],
  },
  {
    icon: 'bug_report',
    title: 'QA',
    topics: ['테스트 종류(단위·통합·E2E)', '테스트 케이스 설계', '결함 보고', '자동화 도구', '회귀 테스트 전략'],
  },
  {
    icon: 'shield',
    title: '보안',
    topics: ['OWASP Top 10', '암호화·해시', '인증 취약점', '로그·침해 대응', '권한 최소화'],
  },
  {
    icon: 'memory',
    title: '공통 CS 기초',
    topics: ['자료구조·알고리즘', '운영체제(프로세스·스레드)', '네트워크(TCP/IP)', '데이터베이스', 'Git 협업'],
  },
]

const types = [
  { title: '인성 면접', description: '지원 동기, 협업 경험, 갈등 해결, 실패 경험처럼 태도와 가치관을 봅니다.', example: '팀원과 의견이 달랐던 경험을 말해 주세요.' },
  { title: '기술 기초 면접', description: '직무에 필요한 CS·언어·프레임워크 개념을 정확히 이해하는지 봅니다.', example: '프로세스와 스레드의 차이는 무엇인가요?' },
  { title: '프로젝트 경험 면접', description: '이력서·포트폴리오의 프로젝트에서 내가 맡은 일, 선택한 기술의 이유, 문제 해결 과정을 깊게 묻습니다.', example: '그 기술을 고른 이유와 다른 대안은 무엇이었나요?' },
  { title: '코딩·라이브 코딩', description: '문제를 풀면서 생각을 말로 설명하는 과정을 봅니다. 정답보다 접근 방법과 소통이 중요합니다.', example: '이 함수의 시간 복잡도를 줄일 방법이 있을까요?' },
  { title: '시스템 설계 (주로 경력)', description: '요구사항을 정리하고 구성 요소, 데이터 흐름, 확장성과 장애 대응을 설계합니다.', example: '단축 URL 서비스를 설계해 보세요.' },
]

const prepareItems = [
  '이력서·포트폴리오에 적은 모든 프로젝트를 2~3분 안에 설명할 수 있게 정리하기 (문제 → 내 역할 → 해결 → 결과)',
  'GitHub·블로그 정리: README, 실행 방법, 대표 커밋을 면접관이 바로 볼 수 있게',
  '지원 회사의 서비스, 기술 스택, 최근 기술 블로그·채용 공고의 자격 요건 확인하기',
  '1분 자기소개와 지원 동기 준비하기 (외우기보다 핵심 키워드 3개로)',
  '프로젝트에서 쓴 기술은 "왜 썼는지, 단점은 무엇인지" 까지 답할 수 있게 하기',
  '면접 끝에 할 역질문 2~3개 (팀 개발 문화, 코드 리뷰 방식, 온보딩 등)',
]

const dressCards = [
  {
    icon: 'checkroom',
    title: 'IT 기업·스타트업',
    badge: '비즈니스 캐주얼',
    items: ['깔끔한 셔츠·니트·블라우스, 단정한 면바지나 슬랙스', '회사가 "편한 복장" 을 안내했다면 따르되 구김·얼룩 없는 옷', '후드티·트레이닝복·슬리퍼는 피하기'],
  },
  {
    icon: 'business_center',
    title: '금융·공기업·대기업 IT',
    badge: '정장 권장',
    items: ['어두운 색 정장과 흰색·하늘색 셔츠', '넥타이는 단색 또는 잔무늬', '구두·벨트·가방은 무난한 색으로 통일'],
  },
  {
    icon: 'videocam',
    title: '화상 면접',
    badge: '상의 기준',
    items: ['화면에 보이는 상의는 대면 면접과 같은 수준으로', '잔줄무늬·체크·작은 패턴은 화면에서 일렁여 보이니 단색 추천', '배경과 비슷한 색은 피하고, 하의도 갖춰 입으면 일어설 때도 안심'],
  },
  {
    icon: 'face',
    title: '공통 몸가짐',
    badge: '첫인상',
    items: ['머리는 얼굴을 가리지 않게 정리', '향이 강한 향수, 큰 액세서리는 피하기', '손톱·안경 렌즈 등 작은 부분까지 깨끗하게'],
  },
]

const onlineItems = [
  '카메라는 눈높이에, 화면에는 머리부터 가슴까지 보이게 (이 서비스의 자세 분석도 어깨가 보여야 정확합니다)',
  '조명은 얼굴 정면에서. 창문을 등지면 얼굴이 어둡게 나옵니다',
  '조용한 방에서 알림을 끄고, 가능하면 마이크가 있는 이어폰 사용',
  '배경은 단순하게 정리하고 사람이 지나가지 않는 곳 선택',
  '화면 속 면접관 얼굴보다 카메라 렌즈를 보고 말하기',
  '시작 10분 전 접속해 카메라·마이크·네트워크 점검',
]

const answerTips = [
  { title: '두괄식으로 말하기', description: '결론을 먼저 한 문장으로 말하고, 이유와 사례를 덧붙입니다.' },
  { title: 'STAR 구조', description: '상황(Situation) → 과제(Task) → 행동(Action) → 결과(Result) 순서로 경험을 설명합니다. 결과는 숫자로 말하면 좋습니다.' },
  { title: '모르는 질문은 솔직하게', description: '"정확히는 모르지만 이렇게 접근해 보겠습니다" 처럼 아는 범위와 사고 과정을 보여 줍니다. 아는 척은 꼬리 질문에서 드러납니다.' },
  { title: '답변 길이는 1~2분', description: '너무 짧으면 성의가 없어 보이고, 3분이 넘으면 핵심이 흐려집니다. 이 서비스의 답변 시간 제한(기본 2분)으로 연습해 보세요.' },
  { title: '군말·침묵 줄이기', description: '"음, 어" 대신 잠깐 멈추고 생각을 정리해도 괜찮습니다. 결과 리포트의 군말·침묵 지표로 습관을 확인하세요.' },
]

const ddayItems = [
  '면접 장소·시간, 화상 면접 링크와 접속 프로그램 미리 확인',
  '이력서·포트폴리오 출력본 또는 화면 공유할 파일 준비',
  '신분증, 필기구, 물 (대면 면접)',
  '노트북 충전, 인터넷 연결 확인 (화상 면접)',
  '10~15분 일찍 도착하거나 접속하기',
  '마지막으로 1분 자기소개와 지원 동기 소리 내어 한 번 말해 보기',
]

export default function InterviewGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <GuideHeader
        eyebrow="면접 준비 가이드"
        title="IT·개발 직무 면접, 이렇게 준비하세요"
        description="컴퓨터·IT·소프트웨어 직무 면접에서 자주 나오는 주제와 면접 유형, 준비물과 복장, 화상 면접 환경까지 한 번에 정리했습니다. 회사마다 방식이 다르니 지원하는 곳의 안내를 가장 먼저 확인하세요."
        toc={toc}
      />

      <GuideSection id="roles" icon="code" title="직무별 자주 나오는 주제" description="모의 면접을 만들 때 분야에 직무 이름을 넣으면 해당 직무 중심으로 질문이 만들어집니다.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <Card key={r.title} className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Icon name={r.icon} size={22} className="text-primary" />
                <h3 className="font-heading text-base font-bold">{r.title}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.topics.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </GuideSection>

      <GuideSection id="types" icon="forum" title="면접 유형" description="한 번의 면접에 여러 유형이 섞여 나오는 경우가 많습니다.">
        <div className="grid gap-4 md:grid-cols-2">
          {types.map((t) => (
            <Card key={t.title} className="p-5">
              <h3 className="font-heading text-base font-bold">{t.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
              <p className="mt-3 rounded-control bg-muted p-3 text-sm">
                <span className="mr-1 font-semibold text-primary">예시</span>
                {t.example}
              </p>
            </Card>
          ))}
        </div>
      </GuideSection>

      <GuideSection id="prepare" icon="inventory_2" title="준비물과 사전 준비">
        <Card className="p-6">
          <CheckList items={prepareItems} />
        </Card>
      </GuideSection>

      <GuideSection id="dress" icon="checkroom" title="복장 준비" description="IT 업계는 비교적 자유롭지만, 회사와 면접 형태에 맞춰 단정하게 입는 것이 기본입니다.">
        <div className="grid gap-4 md:grid-cols-2">
          {dressCards.map((d) => (
            <Card key={d.title} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Icon name={d.icon} size={22} className="text-primary" />
                <h3 className="font-heading text-base font-bold">{d.title}</h3>
                <Badge variant="accent">{d.badge}</Badge>
              </div>
              <CheckList items={d.items} />
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">복장 안내가 따로 있다면 그 안내가 우선입니다. 확신이 없으면 한 단계 더 단정한 쪽을 고르세요.</p>
      </GuideSection>

      <GuideSection id="online" icon="videocam" title="화상 면접 환경" description="이 서비스로 연습할 때도 같은 환경을 갖추면 실제 면접에서 덜 긴장합니다.">
        <Card className="p-6">
          <CheckList items={onlineItems} />
        </Card>
      </GuideSection>

      <GuideSection id="answer" icon="record_voice_over" title="답변 요령">
        <div className="grid gap-4 md:grid-cols-2">
          {answerTips.map((t, i) => (
            <Card key={t.title} className="flex gap-4 p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div>
                <h3 className="font-heading text-base font-bold">{t.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </GuideSection>

      <GuideSection id="dday" icon="event_available" title="면접 당일 체크리스트">
        <Card className="p-6">
          <CheckList items={ddayItems} />
        </Card>
      </GuideSection>

      <GuideCta title="준비한 내용을 실전처럼 말해 보세요" description="직무 이름과 채용 공고를 넣으면 맞춤 질문이 만들어지고, 답변이 끝나면 내용·말하기·자세 피드백을 받을 수 있습니다." />
    </div>
  )
}
