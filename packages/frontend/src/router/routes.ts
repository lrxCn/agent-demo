import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/login/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('../components/layout/AppLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/dashboard/DashboardView.vue'),
        meta: { title: '仪表盘' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/user/UserListView.vue'),
        meta: { title: '用户管理', permissions: ['user:view'] },
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('../views/role/RoleListView.vue'),
        meta: { title: '角色管理', permissions: ['role:view'] },
      },
      {
        path: 'students',
        name: 'Students',
        component: () => import('../views/student/StudentListView.vue'),
        meta: { title: '学生管理', permissions: ['student:view'] },
      },
      {
        path: 'knowledge',
        name: 'Knowledge',
        component: () => import('../views/knowledge/KnowledgeListView.vue'),
        meta: { title: '知识库', permissions: ['knowledge:view'] },
      },
      {
        path: 'rtc',
        name: 'Rtc',
        component: () => import('../views/rtc/RtcView.vue'),
        meta: { title: '语音通话' },
      },
    ],
  },
]
