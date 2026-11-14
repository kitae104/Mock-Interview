import { coverLettersApi } from '../api/coverLetters.ts'
import DocumentList from '../components/career/DocumentList.tsx'
import Badge from '../components/ui/Badge.tsx'

export default function CoverLetterListPage() {
  return (
    <DocumentList
      title="자기소개서 작성 도우미"
      description="회사·문항별로 자기소개서를 쓰고, 경험 메모로 AI 초안을 받거나 문항별 첨삭을 받으세요."
      basePath="/cover-letters"
      newLabel="새 자기소개서"
      emptyText="아직 작성한 자기소개서가 없어요. 지원하는 회사의 문항을 옮겨 적어 시작해 보세요."
      deleteWarning="문항·답변과 첨삭 결과가 지워지고 복구할 수 없어요."
      load={coverLettersApi.list}
      remove={coverLettersApi.remove}
      renderMeta={(c) => (
        <>
          {c.company && <Badge variant="outline">{c.company}</Badge>}
          {c.targetRole && <Badge variant="outline">{c.targetRole}</Badge>}
          <span>문항 {c.itemCount}개</span>
        </>
      )}
    />
  )
}
