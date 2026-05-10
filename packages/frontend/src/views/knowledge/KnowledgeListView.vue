<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { Message, Modal } from '@arco-design/web-vue'
import { isAxiosError } from 'axios'
import {
  assignKnowledgeRoles,
  deleteKnowledge,
  fetchKnowledgePage,
  uploadKnowledge,
  type KnowledgeListItem,
} from '../../api/modules/knowledge'
import { fetchRolesPage, type RoleListItem } from '../../api/modules/role'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()

function hasPermission(code: string): boolean {
  return auth.hasPermission(code)
}

function formatError(e: unknown): string {
  if (e instanceof Error) {
    return e.message
  }
  if (isAxiosError(e)) {
    const data = e.response?.data as { message?: string } | undefined
    if (data?.message) {
      return data.message
    }
  }
  return '请求失败'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return d.toLocaleString('zh-CN')
}

function readableFileType(raw: string | null): string {
  if (!raw) {
    return '—'
  }
  if (raw.includes('markdown')) {
    return '.md'
  }
  if (raw.includes('plain')) {
    return '.txt'
  }
  if (raw.includes('pdf')) {
    return '.pdf'
  }
  return raw
}

const loading = ref(false)
const tableData = ref<KnowledgeListItem[]>([])
const keyword = ref('')
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showTotal: true,
  showPageSize: true,
})

const columns: TableColumnData[] = [
  { title: '知识库名称', dataIndex: 'name', width: 220, ellipsis: true, tooltip: true },
  {
    title: '文件类型',
    dataIndex: 'fileType',
    width: 120,
    render: ({ record }) => readableFileType((record as KnowledgeListItem).fileType),
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 180,
    render: ({ record }) => formatDate((record as KnowledgeListItem).createdAt),
  },
  {
    title: '角色权限',
    dataIndex: 'roles',
    ellipsis: true,
    tooltip: true,
    render: ({ record }) => {
      const roles = (record as KnowledgeListItem).roles ?? []
      if (roles.length === 0) {
        return '未设置'
      }
      return roles.map((r) => r.name).join('、')
    },
  },
  { title: '操作', slotName: 'actions', width: 200, fixed: 'right' },
]

async function loadTable(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchKnowledgePage({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: keyword.value.trim() || undefined,
    })
    tableData.value = res.items
    pagination.total = res.total
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    loading.value = false
  }
}

function onSearch(): void {
  pagination.current = 1
  void loadTable()
}

function onPageChange(page: number): void {
  pagination.current = page
  void loadTable()
}

function onPageSizeChange(size: number): void {
  pagination.pageSize = size
  pagination.current = 1
  void loadTable()
}

void loadTable()

const uploadVisible = ref(false)
const uploadName = ref('')
const uploadFile = ref<File | null>(null)
const uploadSubmitting = ref(false)
const uploadProgress = ref(0)

function openUpload(): void {
  uploadName.value = ''
  uploadFile.value = null
  uploadSubmitting.value = false
  uploadProgress.value = 0
  uploadVisible.value = true
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  if (!file) {
    uploadFile.value = null
    return
  }
  const fileName = file.name.toLowerCase()
  const valid =
    fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.pdf')
  if (!valid) {
    Message.warning('仅支持 .txt、.md、.pdf 文件')
    target.value = ''
    uploadFile.value = null
    return
  }
  uploadFile.value = file
}

async function submitUpload(): Promise<void> {
  const name = uploadName.value.trim()
  if (!name) {
    Message.warning('请输入知识库名称')
    return
  }
  if (!uploadFile.value) {
    Message.warning('请选择上传文件')
    return
  }

  uploadSubmitting.value = true
  uploadProgress.value = 0
  try {
    await uploadKnowledge(
      {
        name,
        file: uploadFile.value,
      },
      (percent) => {
        uploadProgress.value = percent
      },
    )
    uploadProgress.value = 100
    Message.success('上传成功')
    uploadVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    uploadSubmitting.value = false
  }
}

function confirmDelete(record: KnowledgeListItem): void {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除知识库「${record.name}」？`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        await deleteKnowledge(record.id)
        Message.success('已删除')
        await loadTable()
      } catch (e) {
        Message.error(formatError(e))
        throw e
      }
    },
  })
}

const roleVisible = ref(false)
const roleSubmitting = ref(false)
const assigningKnowledge = ref<KnowledgeListItem | null>(null)
const allRoles = ref<RoleListItem[]>([])
const selectedRoleIds = ref<string[]>([])
const roleLoading = ref(false)

const roleOptions = computed(() =>
  allRoles.value.map((r) => ({
    label: r.name,
    value: r.id,
  })),
)

async function openRoleModal(record: KnowledgeListItem): Promise<void> {
  assigningKnowledge.value = record
  selectedRoleIds.value = (record.roles ?? []).map((r) => r.id)
  roleVisible.value = true
  roleLoading.value = true
  try {
    const res = await fetchRolesPage({ page: 1, pageSize: 200 })
    allRoles.value = res.items
  } catch (e) {
    Message.error(formatError(e))
    roleVisible.value = false
  } finally {
    roleLoading.value = false
  }
}

async function submitRoleAssign(): Promise<void> {
  if (!assigningKnowledge.value) {
    return
  }
  roleSubmitting.value = true
  try {
    await assignKnowledgeRoles(assigningKnowledge.value.id, [...selectedRoleIds.value])
    Message.success('角色权限已更新')
    roleVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    roleSubmitting.value = false
  }
}
</script>

<template>
  <a-space direction="vertical" :size="16" fill>
    <a-typography-title :heading="5">知识库管理</a-typography-title>

    <a-card :bordered="false">
      <a-space direction="vertical" :size="16" fill>
        <a-space wrap>
          <a-input-search
            v-model="keyword"
            allow-clear
            placeholder="按知识库名称搜索"
            style="width: 260px"
            @search="onSearch"
            @press-enter="onSearch"
          />
          <a-button v-if="hasPermission('knowledge:create')" type="primary" @click="openUpload">
            上传文件
          </a-button>
        </a-space>

        <a-table
          row-key="id"
          :loading="loading"
          :columns="columns"
          :data="tableData"
          :pagination="pagination"
          @page-change="onPageChange"
          @page-size-change="onPageSizeChange"
        >
          <template #actions="{ record }">
            <a-space>
              <a-button
                v-if="hasPermission('knowledge:manage')"
                type="text"
                size="small"
                @click="openRoleModal(record as KnowledgeListItem)"
              >
                角色权限
              </a-button>
              <a-button
                v-if="hasPermission('knowledge:delete')"
                type="text"
                size="small"
                status="danger"
                @click="confirmDelete(record as KnowledgeListItem)"
              >
                删除
              </a-button>
            </a-space>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <a-modal v-model:visible="uploadVisible" title="上传知识库文件" :mask-closable="false" :footer="false">
      <a-form :model="{ uploadName }" layout="vertical">
        <a-form-item label="知识库名称" required>
          <a-input v-model="uploadName" allow-clear placeholder="请输入名称" />
        </a-form-item>
        <a-form-item label="文件" required>
          <input accept=".txt,.md,.pdf" type="file" @change="onFileChange" />
          <div class="file-hint">支持 .txt / .md / .pdf</div>
        </a-form-item>
      </a-form>

      <a-progress
        v-if="uploadSubmitting || uploadProgress > 0"
        :percent="uploadProgress"
        size="small"
        status="success"
      />

      <div class="modal-footer-btns">
        <a-button :disabled="uploadSubmitting" @click="uploadVisible = false">取消</a-button>
        <a-button type="primary" :loading="uploadSubmitting" @click="submitUpload">上传</a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="roleVisible"
      :title="assigningKnowledge ? `设置角色权限：${assigningKnowledge.name}` : '设置角色权限'"
      width="560px"
      :mask-closable="false"
      :footer="false"
    >
      <a-spin :loading="roleLoading" style="width: 100%">
        <a-checkbox-group v-model="selectedRoleIds" direction="vertical" :options="roleOptions" />
      </a-spin>

      <div class="modal-footer-btns">
        <a-button :disabled="roleSubmitting" @click="roleVisible = false">取消</a-button>
        <a-button type="primary" :loading="roleSubmitting" @click="submitRoleAssign">确定</a-button>
      </div>
    </a-modal>
  </a-space>
</template>

<style scoped>
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.file-hint {
  margin-top: 8px;
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
