<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, TableColumnData } from '@arco-design/web-vue'
import { Message, Modal } from '@arco-design/web-vue'
import { isAxiosError } from 'axios'
import { fetchPermissionsGrouped, type PermissionGroup } from '../../api/modules/permission'
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  fetchRolesPage,
  updateRole,
  type RoleListItem,
} from '../../api/modules/role'
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
const tableData = ref<RoleListItem[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showTotal: true,
  showPageSize: true,
})

const keyword = ref('')

const columns: TableColumnData[] = [
  { title: '角色名', dataIndex: 'name', width: 140 },
  { title: '描述', dataIndex: 'description', ellipsis: true, tooltip: true },
  {
    title: '权限数',
    dataIndex: 'permissions',
    width: 100,
    render: ({ record }) => String((record as RoleListItem).permissions.length),
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 200,
    render: ({ record }) => formatDate((record as RoleListItem).createdAt),
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

function isBuiltinAdmin(record: RoleListItem): boolean {
  return record.name === 'admin'
}

async function loadTable(): Promise<void> {
  loading.value = true
  try {
    const res = await fetchRolesPage({
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
  name: '',
  description: '',
})

const createRules = {
  name: [
    { required: true, message: '请输入角色名' },
    { minLength: 1, maxLength: 64, message: '1～64 字符' },
  ],
}

function openCreate(): void {
  createForm.name = ''
  createForm.description = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const errors = await createFormRef.value?.validate()
  if (errors) {
    return
  }
  createSubmitting.value = true
  try {
    await createRole({
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
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
const editingRecord = ref<RoleListItem | null>(null)
const editForm = reactive({
  name: '',
  description: '',
})

const editRules = {
  name: [
    { required: true, message: '请输入角色名' },
    { minLength: 1, maxLength: 64, message: '1～64 字符' },
  ],
}

function openEdit(record: RoleListItem): void {
  editingRecord.value = record
  editForm.name = record.name
  editForm.description = record.description ?? ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  const errors = await editFormRef.value?.validate()
  if (errors || !editingRecord.value) {
    return
  }
  editSubmitting.value = true
  try {
    await updateRole(editingRecord.value.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
    })
    Message.success('已保存')
    editVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    editSubmitting.value = false
  }
}

const editNameReadonly = computed(() => editingRecord.value !== null && isBuiltinAdmin(editingRecord.value))

// —— 删除 ——
function confirmDelete(record: RoleListItem): void {
  if (isBuiltinAdmin(record)) {
    Message.warning('内置 admin 角色不可删除')
    return
  }
  Modal.confirm({
    title: '确认删除',
    content: `确定删除角色「${record.name}」？已绑定该角色的用户将失去对应权限。`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        await deleteRole(record.id)
        Message.success('已删除')
        await loadTable()
      } catch (e) {
        Message.error(formatError(e))
        throw e
      }
    },
  })
}

// —— 分配权限 ——
const permVisible = ref(false)
const permSubmitting = ref(false)
const permRole = ref<RoleListItem | null>(null)
const permissionGroups = ref<PermissionGroup[]>([])
const selectedPermissionIds = ref<string[]>([])
const permGroupsLoading = ref(false)

function checkboxOptionsForGroup(g: PermissionGroup) {
  return g.permissions.map((p) => ({
    label: `${p.name}（${p.code}）`,
    value: p.id,
  }))
}

async function openAssignPermissions(record: RoleListItem): Promise<void> {
  if (isBuiltinAdmin(record)) {
    Message.warning('内置 admin 角色拥有全部权限，无需在此分配')
    return
  }
  permRole.value = record
  selectedPermissionIds.value = record.permissions.map((p) => p.id)
  permissionGroups.value = []
  permVisible.value = true
  permGroupsLoading.value = true
  try {
    const { groups } = await fetchPermissionsGrouped()
    permissionGroups.value = groups
  } catch (e) {
    Message.error(formatError(e))
    permVisible.value = false
  } finally {
    permGroupsLoading.value = false
  }
}

async function submitAssignPermissions(): Promise<void> {
  if (!permRole.value) {
    return
  }
  permSubmitting.value = true
  try {
    await assignRolePermissions(permRole.value.id, [...selectedPermissionIds.value])
    Message.success('权限已更新')
    permVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    permSubmitting.value = false
  }
}

const canAnyAction = computed(
  () =>
    hasPermission('role:update') ||
    hasPermission('role:delete') ||
    hasPermission('role:assign-permission'),
)
</script>

<template>
  <a-space direction="vertical" :size="16" fill>
    <a-typography-title :heading="5">角色管理</a-typography-title>

    <a-card :bordered="false">
      <a-space direction="vertical" :size="16" fill>
        <a-space wrap>
          <a-input-search
            v-model="keyword"
            allow-clear
            placeholder="按角色名或描述搜索"
            style="width: 260px"
            @search="onSearch"
            @press-enter="onSearch"
          />
          <a-button v-if="hasPermission('role:create')" type="primary" @click="openCreate">
            新增角色
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
                v-if="hasPermission('role:update')"
                type="text"
                size="small"
                @click="openEdit(record as RoleListItem)"
              >
                编辑
              </a-button>
              <a-button
                v-if="hasPermission('role:assign-permission')"
                type="text"
                size="small"
                :disabled="isBuiltinAdmin(record as RoleListItem)"
                @click="openAssignPermissions(record as RoleListItem)"
              >
                分配权限
              </a-button>
              <a-button
                v-if="hasPermission('role:delete')"
                type="text"
                size="small"
                status="danger"
                :disabled="isBuiltinAdmin(record as RoleListItem)"
                @click="confirmDelete(record as RoleListItem)"
              >
                删除
              </a-button>
            </a-space>
            <span v-else class="action-placeholder">—</span>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <a-modal v-model:visible="createVisible" title="新增角色" :mask-closable="false" :footer="false">
      <a-form ref="createFormRef" :model="createForm" :rules="createRules" layout="vertical">
        <a-form-item field="name" label="角色名">
          <a-input v-model="createForm.name" allow-clear placeholder="1～64 字符，唯一" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-textarea v-model="createForm.description" allow-clear placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="createVisible = false">取消</a-button>
        <a-button type="primary" :loading="createSubmitting" @click="submitCreate">确定</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="editVisible" title="编辑角色" :mask-closable="false" :footer="false">
      <a-form ref="editFormRef" :model="editForm" :rules="editRules" layout="vertical">
        <a-form-item field="name" label="角色名">
          <a-input v-model="editForm.name" allow-clear :readonly="editNameReadonly" />
        </a-form-item>
        <a-form-item field="description" label="描述">
          <a-textarea v-model="editForm.description" allow-clear :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="editVisible = false">取消</a-button>
        <a-button type="primary" :loading="editSubmitting" @click="submitEdit">确定</a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="permVisible"
      :title="permRole ? `分配权限：${permRole.name}` : '分配权限'"
      width="640px"
      :mask-closable="false"
      :footer="false"
    >
      <a-spin :loading="permGroupsLoading" style="width: 100%">
        <div class="perm-modal-body">
          <div v-for="g in permissionGroups" :key="g.groupName" class="perm-group">
            <div class="perm-group-title">{{ g.groupName }}</div>
            <a-checkbox-group v-model="selectedPermissionIds" direction="vertical" :options="checkboxOptionsForGroup(g)" />
          </div>
        </div>
      </a-spin>
      <div class="modal-footer-btns">
        <a-button @click="permVisible = false">取消</a-button>
        <a-button type="primary" :loading="permSubmitting" @click="submitAssignPermissions">确定</a-button>
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
.perm-modal-body {
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}
.perm-group {
  margin-bottom: 16px;
}
.perm-group-title {
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--color-text-1);
}
</style>
