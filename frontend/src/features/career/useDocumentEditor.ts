import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client.ts'

// 이력서·자기소개서·포트폴리오 편집 화면의 공통 상태: 불러오기, 입력 값, 저장(새 문서면 생성 후 주소 변경), AI 결과 반영.

interface SavedDoc {
  id: number
  updatedAt: string
}

interface Options<Req, Doc extends SavedDoc> {
  /** 주소의 :id. 새 문서면 undefined */
  id: string | undefined
  basePath: string
  empty: () => Req
  toRequest: (doc: Doc) => Req
  get: (id: string) => Promise<Doc>
  create: (body: Req) => Promise<Doc>
  update: (id: number, body: Req) => Promise<Doc>
}

export function useDocumentEditor<Req, Doc extends SavedDoc>(options: Options<Req, Doc>) {
  const { id, basePath, empty, toRequest, get, create, update } = options
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [form, setForm] = useState<Req>(empty)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id || (doc && String(doc.id) === id)) return // 방금 만든 문서로 주소만 바뀐 경우는 다시 읽지 않습니다.
    let cancelled = false
    setLoading(true)
    get(id)
      .then((res) => {
        if (cancelled) return
        setDoc(res)
        setForm(toRequest(res))
        setDirty(false)
        setLoadError(null)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : '문서를 불러오지 못했습니다.')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id 가 바뀔 때만 다시 읽습니다.
  }, [id])

  /** 입력 값 바꾸기 (변경 표시) */
  const edit = useCallback((change: (prev: Req) => Req) => {
    setForm(change)
    setDirty(true)
  }, [])

  /** AI 결과 등 서버가 돌려준 최신 문서를 반영합니다. 사용자가 고치던 입력 값은 그대로 둡니다. */
  const applyServerDoc = useCallback((next: Doc) => setDoc(next), [])

  /** 저장하고 저장된 문서를 돌려줍니다. 실패하면 null. */
  const save = useCallback(async (): Promise<Doc | null> => {
    setSaving(true)
    setSaveError(null)
    setFieldErrors({})
    try {
      const saved = doc ? await update(doc.id, form) : await create(form)
      setDoc(saved)
      setDirty(false)
      if (!doc) navigate(`${basePath}/${saved.id}`, { replace: true })
      return saved
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message)
        setFieldErrors(err.errors)
      } else {
        setSaveError('저장하지 못했습니다.')
      }
      return null
    } finally {
      setSaving(false)
    }
  }, [doc, form, create, update, navigate, basePath])

  /** AI 도움 전에: 저장하지 않은 변경이 있거나 새 문서면 먼저 저장합니다. */
  const ensureSaved = useCallback(async (): Promise<Doc | null> => {
    if (doc && !dirty) return doc
    return save()
  }, [doc, dirty, save])

  return { doc, form, edit, dirty, loading, loadError, saving, saveError, fieldErrors, save, ensureSaved, applyServerDoc }
}
