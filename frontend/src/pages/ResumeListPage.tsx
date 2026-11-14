import { resumesApi } from '../api/resumes.ts'
import { ScoreBadge } from '../components/career/CareerShared.tsx'
import DocumentList from '../components/career/DocumentList.tsx'
import Badge from '../components/ui/Badge.tsx'

export default function ResumeListPage() {
  return (
    <DocumentList
      title="이력서 작성 도우미"
      description="지원 직무별로 이력서를 만들어 두고, AI 첨삭으로 빠진 키워드와 고칠 점을 확인하세요."
      basePath="/resumes"
      newLabel="새 이력서"
      emptyText="아직 작성한 이력서가 없어요. 지원할 직무를 정하고 첫 이력서를 만들어 보세요."
      deleteWarning="이력서와 첨삭 결과가 지워지고 복구할 수 없어요."
      load={resumesApi.list}
      remove={resumesApi.remove}
      renderMeta={(r) => (
        <>
          <Badge variant="outline">{r.targetRole || '직무 미정'}</Badge>
          {r.reviewScore !== null && <ScoreBadge score={r.reviewScore} />}
        </>
      )}
    />
  )
}
