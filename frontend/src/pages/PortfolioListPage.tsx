import { portfoliosApi } from '../api/portfolios.ts'
import DocumentList from '../components/career/DocumentList.tsx'
import Badge from '../components/ui/Badge.tsx'

export default function PortfolioListPage() {
  return (
    <DocumentList
      title="포트폴리오 관리 도우미"
      description="프로젝트를 한 곳에 정리하고, AI 로 설명을 다듬고 이 프로젝트로 받을 만한 면접 질문을 준비하세요."
      basePath="/portfolios"
      newLabel="새 프로젝트"
      emptyText="아직 등록한 프로젝트가 없어요. 대표 프로젝트부터 하나씩 정리해 보세요."
      deleteWarning="프로젝트 정보와 AI 결과가 지워지고 복구할 수 없어요."
      load={portfoliosApi.list}
      remove={portfoliosApi.remove}
      renderMeta={(p) => (
        <>
          {p.featured && <Badge variant="success">대표</Badge>}
          {p.summary && <span className="truncate">{p.summary}</span>}
          {p.techStack.slice(0, 5).map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </>
      )}
    />
  )
}
