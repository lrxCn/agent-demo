<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, TableColumnData } from '@arco-design/web-vue'
import { Message, Modal } from '@arco-design/web-vue'
import { isAxiosError } from 'axios'
import {
  batchCreateStudents,
  batchDeleteStudents,
  createStudent,
  deleteStudent,
  fetchStudentsPage,
  updateStudent,
  type CreateStudentBody,
  type StudentListItem,
} from '../../api/modules/student'
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
const tableData = ref<StudentListItem[]>([])
const selectedKeys = ref<string[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showTotal: true,
  showPageSize: true,
})

const keyword = ref('')

const rowSelection = {
  type: 'checkbox' as const,
  showCheckedAll: true,
  onlyCurrent: false,
}

const columns: TableColumnData[] = [
  {
    title: '姓名',
    dataIndex: 'name',
    width: 120,
    sortable: { sortDirections: ['ascend', 'descend'] },
  },
  {
    title: '学号',
    dataIndex: 'studentNo',
    width: 140,
    sortable: { sortDirections: ['ascend', 'descend'] },
  },
  { title: '性别', dataIndex: 'gender', width: 88, ellipsis: true, tooltip: true },
  { title: '班级', dataIndex: 'className', width: 140, ellipsis: true, tooltip: true },
  { title: '手机', dataIndex: 'phone', width: 128, ellipsis: true, tooltip: true },
  { title: '邮箱', dataIndex: 'email', ellipsis: true, tooltip: true },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    width: 180,
    sortable: { sortDirections: ['ascend', 'descend'] },
    render: ({ record }) => formatDate((record as StudentListItem).createdAt),
  },
  { title: '操作', slotName: 'actions', width: 160, fixed: 'right' },
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
    const res = await fetchStudentsPage({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: keyword.value.trim() || undefined,
    })
    tableData.value = res.items
    pagination.total = res.total
    selectedKeys.value = selectedKeys.value.filter((id) => res.items.some((r) => r.id === id))
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
  studentNo: '',
  gender: '',
  className: '',
  phone: '',
  email: '',
})

const createRules = {
  name: [{ required: true, message: '请输入姓名' }],
  studentNo: [{ required: true, message: '请输入学号' }],
}

function openCreate(): void {
  createForm.name = ''
  createForm.studentNo = ''
  createForm.gender = ''
  createForm.className = ''
  createForm.phone = ''
  createForm.email = ''
  createVisible.value = true
}

function optionalBodyFields(f: {
  gender: string
  className: string
  phone: string
  email: string
}): Pick<CreateStudentBody, 'gender' | 'class_name' | 'phone' | 'email'> {
  const out: Pick<CreateStudentBody, 'gender' | 'class_name' | 'phone' | 'email'> = {}
  const g = f.gender.trim()
  if (g) {
    out.gender = g
  }
  const c = f.className.trim()
  if (c) {
    out.class_name = c
  }
  const p = f.phone.trim()
  if (p) {
    out.phone = p
  }
  const e = f.email.trim()
  if (e) {
    out.email = e
  }
  return out
}

async function submitCreate(): Promise<void> {
  const errors = await createFormRef.value?.validate()
  if (errors) {
    return
  }
  createSubmitting.value = true
  try {
    await createStudent({
      name: createForm.name.trim(),
      student_no: createForm.studentNo.trim(),
      ...optionalBodyFields(createForm),
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
  name: '',
  studentNo: '',
  gender: '',
  className: '',
  phone: '',
  email: '',
})

const editRules = {
  name: [{ required: true, message: '请输入姓名' }],
  studentNo: [{ required: true, message: '请输入学号' }],
}

function openEdit(record: StudentListItem): void {
  editingId.value = record.id
  editForm.name = record.name
  editForm.studentNo = record.studentNo
  editForm.gender = record.gender ?? ''
  editForm.className = record.className ?? ''
  editForm.phone = record.phone ?? ''
  editForm.email = record.email ?? ''
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  const errors = await editFormRef.value?.validate()
  if (errors || !editingId.value) {
    return
  }
  editSubmitting.value = true
  try {
    const payload = {
      name: editForm.name.trim(),
      student_no: editForm.studentNo.trim(),
      ...optionalBodyFields(editForm),
    }
    await updateStudent(editingId.value, payload)
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
function confirmDelete(record: StudentListItem): void {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除学生「${record.name}」（学号 ${record.studentNo}）？此操作不可恢复。`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        await deleteStudent(record.id)
        Message.success('已删除')
        selectedKeys.value = selectedKeys.value.filter((k) => k !== record.id)
        await loadTable()
      } catch (e) {
        Message.error(formatError(e))
        throw e
      }
    },
  })
}

function confirmBatchDelete(): void {
  const ids = [...selectedKeys.value]
  if (ids.length === 0) {
    return
  }
  Modal.confirm({
    title: '批量删除',
    content: `确定删除已选中的 ${ids.length} 条学生记录？此操作不可恢复。`,
    okText: '删除',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        const { deleted } = await batchDeleteStudents(ids)
        Message.success(`已删除 ${deleted} 条`)
        selectedKeys.value = []
        await loadTable()
      } catch (e) {
        Message.error(formatError(e))
        throw e
      }
    },
  })
}

// —— 批量导入 ——
interface ImportRow {
  id: string
  name: string
  studentNo: string
  gender: string
  className: string
  phone: string
  email: string
}

const batchImportVisible = ref(false)
const batchImportSubmitting = ref(false)
const importRows = ref<ImportRow[]>([])

function emptyImportRow(): ImportRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    studentNo: '',
    gender: '',
    className: '',
    phone: '',
    email: '',
  }
}

function openBatchImport(): void {
  importRows.value = [emptyImportRow(), emptyImportRow(), emptyImportRow()]
  batchImportVisible.value = true
}

function addImportRow(): void {
  importRows.value = [...importRows.value, emptyImportRow()]
}

function removeImportRow(rowId: string): void {
  if (importRows.value.length <= 1) {
    Message.warning('至少保留一行')
    return
  }
  importRows.value = importRows.value.filter((r) => r.id !== rowId)
}

async function submitBatchImport(): Promise<void> {
  const rows = importRows.value
    .map((r) => ({
      name: r.name.trim(),
      studentNo: r.studentNo.trim(),
      gender: r.gender.trim(),
      className: r.className.trim(),
      phone: r.phone.trim(),
      email: r.email.trim(),
    }))
    .filter((r) => r.name !== '' || r.studentNo !== '')

  const invalid = rows.find((r) => r.name === '' || r.studentNo === '')
  if (invalid) {
    Message.warning('已填写的行必须同时填写姓名与学号')
    return
  }
  if (rows.length === 0) {
    Message.warning('请至少填写一行完整数据（姓名 + 学号）')
    return
  }
  const nos = rows.map((r) => r.studentNo)
  if (new Set(nos).size !== nos.length) {
    Message.warning('导入数据中存在重复学号')
    return
  }

  const items: CreateStudentBody[] = rows.map((r) => ({
    name: r.name,
    student_no: r.studentNo,
    ...optionalBodyFields({
      gender: r.gender,
      className: r.className,
      phone: r.phone,
      email: r.email,
    }),
  }))

  batchImportSubmitting.value = true
  try {
    const created = await batchCreateStudents(items)
    Message.success(`成功导入 ${created.length} 条`)
    batchImportVisible.value = false
    await loadTable()
  } catch (e) {
    Message.error(formatError(e))
  } finally {
    batchImportSubmitting.value = false
  }
}

const canAnyRowAction = computed(
  () => hasPermission('student:update') || hasPermission('student:delete'),
)

const hasBatchSelection = computed(() => selectedKeys.value.length > 0)
</script>

<template>
  <a-space direction="vertical" :size="16" fill>
    <a-typography-title :heading="5">学生管理</a-typography-title>

    <a-card :bordered="false">
      <a-space direction="vertical" :size="16" fill>
        <a-space wrap>
          <a-input-search
            v-model="keyword"
            allow-clear
            placeholder="按姓名或学号搜索"
            style="width: 260px"
            @search="onSearch"
            @press-enter="onSearch"
          />
          <a-button v-if="hasPermission('student:create')" type="primary" @click="openCreate">
            新增学生
          </a-button>
          <a-button v-if="hasPermission('student:create')" @click="openBatchImport">批量导入</a-button>
          <a-button
            v-if="hasPermission('student:delete')"
            status="danger"
            :disabled="!hasBatchSelection"
            @click="confirmBatchDelete"
          >
            批量删除
          </a-button>
        </a-space>

        <a-table
          v-model:selected-keys="selectedKeys"
          row-key="id"
          :loading="loading"
          :columns="columns"
          :data="tableData"
          :pagination="pagination"
          :row-selection="rowSelection"
          @page-change="onPageChange"
          @page-size-change="onPageSizeChange"
        >
          <template #actions="{ record }">
            <a-space v-if="canAnyRowAction">
              <a-button
                v-if="hasPermission('student:update')"
                type="text"
                size="small"
                @click="openEdit(record as StudentListItem)"
              >
                编辑
              </a-button>
              <a-button
                v-if="hasPermission('student:delete')"
                type="text"
                size="small"
                status="danger"
                @click="confirmDelete(record as StudentListItem)"
              >
                删除
              </a-button>
            </a-space>
            <span v-else class="action-placeholder">—</span>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <a-modal v-model:visible="createVisible" title="新增学生" :mask-closable="false" :footer="false">
      <a-form ref="createFormRef" :model="createForm" :rules="createRules" layout="vertical">
        <a-form-item field="name" label="姓名">
          <a-input v-model="createForm.name" allow-clear placeholder="必填" />
        </a-form-item>
        <a-form-item field="studentNo" label="学号">
          <a-input v-model="createForm.studentNo" allow-clear placeholder="唯一" />
        </a-form-item>
        <a-form-item field="gender" label="性别">
          <a-input v-model="createForm.gender" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="className" label="班级">
          <a-input v-model="createForm.className" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="phone" label="手机">
          <a-input v-model="createForm.phone" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="email" label="邮箱">
          <a-input v-model="createForm.email" allow-clear placeholder="可选" />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="createVisible = false">取消</a-button>
        <a-button type="primary" :loading="createSubmitting" @click="submitCreate">确定</a-button>
      </div>
    </a-modal>

    <a-modal v-model:visible="editVisible" title="编辑学生" :mask-closable="false" :footer="false">
      <a-form ref="editFormRef" :model="editForm" :rules="editRules" layout="vertical">
        <a-form-item field="name" label="姓名">
          <a-input v-model="editForm.name" allow-clear />
        </a-form-item>
        <a-form-item field="studentNo" label="学号">
          <a-input v-model="editForm.studentNo" allow-clear />
        </a-form-item>
        <a-form-item field="gender" label="性别">
          <a-input v-model="editForm.gender" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="className" label="班级">
          <a-input v-model="editForm.className" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="phone" label="手机">
          <a-input v-model="editForm.phone" allow-clear placeholder="可选" />
        </a-form-item>
        <a-form-item field="email" label="邮箱">
          <a-input v-model="editForm.email" allow-clear placeholder="可选" />
        </a-form-item>
      </a-form>
      <div class="modal-footer-btns">
        <a-button @click="editVisible = false">取消</a-button>
        <a-button type="primary" :loading="editSubmitting" @click="submitEdit">确定</a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="batchImportVisible"
      title="批量导入学生"
      width="720px"
      :mask-closable="false"
      :footer="false"
    >
      <a-typography-text type="secondary">
        每行填写一条：姓名与学号为必填，其余选填；空行会被忽略。请勿在表格内使用重复学号。
      </a-typography-text>
      <div class="batch-import-toolbar">
        <a-button type="outline" size="small" @click="addImportRow">添加一行</a-button>
      </div>
      <div class="batch-import-scroll">
        <a-table
          :pagination="false"
          :bordered="{ cell: true }"
          row-key="id"
          :data="importRows"
          :columns="[
            { title: '姓名', dataIndex: 'name', slotName: 'col-name', width: 120 },
            { title: '学号', dataIndex: 'studentNo', slotName: 'col-no', width: 120 },
            { title: '性别', dataIndex: 'gender', slotName: 'col-gender', width: 88 },
            { title: '班级', dataIndex: 'className', slotName: 'col-class', width: 120 },
            { title: '手机', dataIndex: 'phone', slotName: 'col-phone', width: 120 },
            { title: '邮箱', dataIndex: 'email', slotName: 'col-email', width: 140 },
            { title: '', slotName: 'col-op', width: 72 },
          ]"
        >
          <template #col-name="{ record }">
            <a-input v-model="record.name" allow-clear placeholder="必填" />
          </template>
          <template #col-no="{ record }">
            <a-input v-model="record.studentNo" allow-clear placeholder="必填" />
          </template>
          <template #col-gender="{ record }">
            <a-input v-model="record.gender" allow-clear />
          </template>
          <template #col-class="{ record }">
            <a-input v-model="record.className" allow-clear />
          </template>
          <template #col-phone="{ record }">
            <a-input v-model="record.phone" allow-clear />
          </template>
          <template #col-email="{ record }">
            <a-input v-model="record.email" allow-clear />
          </template>
          <template #col-op="{ record }">
            <a-button type="text" size="small" status="danger" @click="removeImportRow(record.id)">移除</a-button>
          </template>
        </a-table>
      </div>
      <div class="modal-footer-btns">
        <a-button @click="batchImportVisible = false">取消</a-button>
        <a-button type="primary" :loading="batchImportSubmitting" @click="submitBatchImport">导入</a-button>
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
.batch-import-toolbar {
  margin: 12px 0 8px;
}
.batch-import-scroll {
  max-height: 48vh;
  overflow: auto;
}
</style>
