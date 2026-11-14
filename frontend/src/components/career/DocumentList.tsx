import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../../lib/interviewLabels.ts'
import Alert from '../ui/Alert.tsx'
import Card from '../ui/Card.tsx'
import Icon from '../ui/Icon.tsx'
import { buttonClass } from '../ui/styles.ts'
import { CareerHeader, ConfirmDeleteButton } from './CareerShared.tsx'
import { errorText } from '../../features/career/common.ts'

interface Item {
  id: number
  title: string
  updatedAt: string
}

interface Props<T extends Item> {
  title: string
  description: string
  basePath: string
  newLabel: string
  emptyText: string
  deleteWarning: string
  load: () => Promise<T[]>
  remove: (id: number) => Promise<void>
  /** 제목 아래에 보여 줄 내용 (직무, 배지 등) */
  renderMeta: (item: T) => ReactNode
}

// 이력서·자기소개서·포트폴리오 목록 화면의 공통 모양
export default function DocumentList<T extends Item>({
  title,
  description,
  basePath,
  newLabel,
  emptyText,
  deleteWarning,
  load,
  remove,
  renderMeta,
}: Props<T>) {
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    load()
      .then((res) => {
        setItems(res)
        setError(null)
      })
      .catch((err) => setError(errorText(err, '목록을 불러오지 못했습니다.').message))
  }, [load])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <CareerHeader
        title={title}
        description={description}
        actions={
          <Link to={`${basePath}/new`} className={buttonClass()}>
            <Icon name="add" size={18} />
            {newLabel}
          </Link>
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {items === null && !error && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
      {items?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="note_add" size={40} className="text-primary" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          <Link to={`${basePath}/new`} className={buttonClass({ variant: 'secondary' })}>
            {newLabel}
          </Link>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {items?.map((item) => (
          <li key={item.id}>
            <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <Link to={`${basePath}/${item.id}`} className="min-w-0 flex-1">
                <p className="truncate font-heading text-lg font-bold hover:text-primary">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {renderMeta(item)}
                  <span className="text-xs">수정 {formatDateTime(item.updatedAt)}</span>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link to={`${basePath}/${item.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  열기
                </Link>
                <ConfirmDeleteButton
                  warning={deleteWarning}
                  onDelete={async () => {
                    await remove(item.id)
                    reload()
                  }}
                />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
