<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, TableColumnData } from '@arco-design/web-vue'
import { Message, Modal } from '@arco-design/web-vue'
import { isAxiosError } from 'axios'
import {
  assignUserRoles,
  createUser,
  deleteUser,
  fetchRolesPage,
  fetchUserById,
  fetchUsersPage,
  updateUser,
  type RolePickerItem,
  type UserListItem,
} from '../../api/modules/user'
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

const loading = ref(false)
const tableData = ref<UserListItem[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showTotal: true,
  showPageSize: true,
})

const keyword = ref('')

const columns: TableColumnData[] = [
  { title: '用户名', dataIndex: 'username', width: 160 },
  { title: '昵称', dataIndex: 'nickname', width: 160 },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 200,
    render: ({ record }) => formatDate((record as UserListItem).createdAt),
  },
  { title: '操作', slotName: 'actions', width: 280, fixed: 'right' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return d.toLocaleString('zh-CN')
}

async function loadTable(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchUsersPage({
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

// —— 新增 ——
const createVisible = ref(false)
const createFormRef = ref<FormInstance>()
const createSubmitting = ref(false)
const createForm = reactive({
  username: '',
  password: '',
  nickname: '',
})

const createRules = {
  username: [
    { required: true, message: '请输入用户名' },
    { minLength: 3, message: '用户名至少 3 个字符' },
  ],
  password: [
    { required: true, message: '请输入密码' },
    { minLength: 6, message: '密码至少 6 个字符' },
  ],
}

function openCreate(): void {
  createForm.username = ''
  createForm.password = ''
  createForm.nickname = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const errors = await createFormRef.value?.validate()
  if (errors) {
    return
  }
  createSubmitting.value = true
  try {
    await createUser({
      username: createForm.username.trim(),
      password: createForm.password,
      nickname: createForm.nickname.trim() || undefined,
    })
    Message.success('创建成功')
    createVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    createSubmitting.value = false
  }
}

// —— 编辑 ——
const editVisible = ref(false)
const editFormRef = ref<FormInstance>()
const editSubmitting = ref(false)
const editingId = ref<string | null>(null)
const editForm = reactive({
  username: '',
  password: '',
  nickname: '',
})

const editRules = {
  username: [
    { required: true, message: '请输入用户名' },
    { minLength: 3, message: '用户名至少 3 个字符' },
  ],
}

function openEdit(record: UserListItem): void {
  editingId.value = record.id
  editForm.username = record.username
  editForm.nickname = record.nickname ?? ''
  editForm.password = ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  const errors = await editFormRef.value?.validate()
  if (errors || !editingId.value) {
    return
  }
  const pwd = editForm.password.trim()
  if (pwd && pwd.length < 6) {
    Message.warning('新密码至少 6 个字符，或留空不修改')
    return
  }
  editSubmitting.value = true
  try {
    const payload: { username: string; nickname?: string; password?: string } = {
      username: editForm.username.trim(),
      nickname: editForm.nickname.trim(),
    }
    if (pwd) {
      payload.password = pwd
    }
    await updateUser(editingId.value, payload)
    Message.success('已保存')
    editVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    editSubmitting.value = false
  }
}

// —— 删除 ——
function confirmDelete(record: UserListItem): void {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除用户「${record.username}」？此操作不可恢复。`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        await deleteUser(record.id)
        Message.success('已删除')
        await loadTable()
      } catch (e) {
        Message.error(formatError(e))
        throw e
      }
    },
  })
}

// —— 分配角色 ——
const rolesVisible = ref(false)
const rolesSubmitting = ref(false)
const rolesUserId = ref<string | null>(null)
const rolesUserLabel = ref('')
const roleOptions = ref<{ label: string; value: string }[]>([])
const selectedRoleIds = ref<string[]>([])

async function openAssignRoles(record: UserListItem): Promise<void> {
  rolesUserId.value = record.id
  rolesUserLabel.value = record.username
  selectedRoleIds.value = []
  roleOptions.value = []
  rolesVisible.value = true
  try {
    const [detail, rolesPage] = await Promise.all([
      fetchUserById(record.id),
      fetchRolesPage({ page: 1, pageSize: 200 }),
    ])
    selectedRoleIds.value = (detail.roles ?? []).map((r) => r.id)
    roleOptions.value = rolesPage.items.map((r: RolePickerItem) => ({
      label: r.name,
      value: r.id,
    }))
  } catch (e) {
    Message.error(formatError(e))
    rolesVisible.value = false
  }
}

async function submitAssignRoles(): Promise<void> {
  if (!rolesUserId.value) {
    return
  }
  rolesSubmitting.value = true
  try {
    await assignUserRoles(rolesUserId.value, [...selectedRoleIds.value])
    Message.success('角色已更新')
    rolesVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    rolesSubmitting.value = false
  }
}

const canAnyAction = computed(
  () =>
    hasPermission('user:update') ||
    hasPermission('user:delete') ||
    hasPermission('user:assign-role'),
)
</script>

<template>
  <a-space direction="vertical" :size="16" fill>
    <a-typography-title :heading="5">用户管理</a-typography-title>

    <a-card :bordered="false">
      <a-space direction="vertical" :size="16" fill>
        <a-space wrap>
          <a-input-search
            v-model="keyword"
            allow-clear
            placeholder="按用户名或昵称搜索"
            style="width: 260px"
            @search="onSearch"
            @press-enter="onSearch"
          />
          <a-button v-if="hasPermission('user:create')" type="primary" @click="openCreate">
            新增用户
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
            <a-space v-if="canAnyAction">
              <a-button
                v-if="hasPermission('user:update')"
                type="text"
                size="small"
                @click="openEdit(record as UserListItem)"
              >
                编辑
              </a-button>
              <a-button
                v-if="hasPermission('user:assign-role')"
                type="text"
                size="small"
                @click="openAssignRoles(record as UserListItem)"
              >
                分配角色
              </a-button>
              <a-button
                v-if="hasPermission('user:delete')"
                type="text"
                size="small"
                status="danger"
                @click="confirmDelete(record as UserListItem)"
              >
                删除
              </a-button>
            </a-space>
            <span v-else class="action-placeholder">—</span>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <a-modal v-model:visible="createVisible" title="新增用户" :mask-closable="false" :footer="false">
      <a-form ref="createFormRef" :model="createForm" :rules="createRules" layout="vertical">
        <a-form-item field="username" label="用户名">
          <a-input v-model="createForm.username" allow-clear placeholder="3～64 字符" />
        </a-form-item>
        <a-form-item field="password" label="密码">
          <a-input-password v-model="createForm.password" placeholder="至少 6 位" />
        </a-form-item>
        <a-form-item field="nickname" label="昵称">
          <a-input v-model="createForm.nickname" allow-clear placeholder="可选" />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="createVisible = false">取消</a-button>
        <a-button type="primary" :loading="createSubmitting" @click="submitCreate">确定</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="editVisible" title="编辑用户" :mask-closable="false" :footer="false">
      <a-form ref="editFormRef" :model="editForm" :rules="editRules" layout="vertical">
        <a-form-item field="username" label="用户名">
          <a-input v-model="editForm.username" allow-clear />
        </a-form-item>
        <a-form-item field="password" label="新密码">
          <a-input-password v-model="editForm.password" placeholder="留空则不修改" />
        </a-form-item>
        <a-form-item field="nickname" label="昵称">
          <a-input v-model="editForm.nickname" allow-clear />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="editVisible = false">取消</a-button>
        <a-button type="primary" :loading="editSubmitting" @click="submitEdit">确定</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="rolesVisible" :title="`分配角色：${rolesUserLabel}`" :mask-closable="false" :footer="false">
      <a-select
        v-model="selectedRoleIds"
        multiple
        allow-clear
        allow-search
        placeholder="选择角色（可多选）"
        :options="roleOptions"
        style="width: 100%"
      />
      <div class="modal-footer-btns">
        <a-button @click="rolesVisible = false">取消</a-button>
        <a-button type="primary" :loading="rolesSubmitting" @click="submitAssignRoles">确定</a-button>
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
.action-placeholder {
  color: var(--color-text-3);
}
</style>
