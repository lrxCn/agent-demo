import request, { unwrapApiData } from '../request'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface KnowledgeRoleItem {
  id: string
  name: string
}

export interface KnowledgeListItem {
  id: string
  name: string
  fileName: string | null
  fileType: string | null
  createdAt: string
  updatedAt: string
  roles: KnowledgeRoleItem[]
}

export interface UploadKnowledgePayload {
  name: string
  file: File
}

export async function fetchKnowledgePage(params: {
  page: number
  pageSize: number
  keyword?: string
}): Promise<PaginatedResult<KnowledgeListItem>> {
  const body = await request.get<unknown>('/knowledge', { params })
  return unwrapApiData<PaginatedResult<KnowledgeListItem>>(body)
}

export async function uploadKnowledge(
  payload: UploadKnowledgePayload,
  onProgress?: (percent: number) => void,
): Promise<KnowledgeListItem> {
  const form = new FormData()
  form.append('name', payload.name)
  form.append('file', payload.file)
  const body = await request.post<unknown>('/knowledge/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!onProgress) {
        return
      }
      const total = event.total ?? 0
      if (total <= 0) {
        onProgress(0)
        return
      }
      onProgress(Math.min(100, Math.round((event.loaded * 100) / total)))
    },
  })
  return unwrapApiData<KnowledgeListItem>(body)
}

export async function deleteKnowledge(knowledgeId: string): Promise<void> {
  const body = await request.delete<unknown>(`/knowledge/${knowledgeId}`)
  unwrapApiData<unknown>(body)
}

export async function assignKnowledgeRoles(
  knowledgeId: string,
  roleIds: string[],
): Promise<KnowledgeListItem> {
  const body = await request.put<unknown>(`/knowledge/${knowledgeId}/roles`, { roleIds })
  return unwrapApiData<KnowledgeListItem>(body)
}
