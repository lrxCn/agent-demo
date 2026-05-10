<script setup lang="ts">
import { Message } from '@arco-design/web-vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useWebRTC } from '../../composables/useWebRTC'

const auth = useAuthStore()
const {
  incomingCall,
  onlineUserIds,
  remoteStream,
  callingUserId,
  activeUserId,
  callDurationSec,
  recordedBlob,
  isTranscribing,
  transcribedText,
  isSendingAudioFile,
  sendingProgress,
  sendingFileName,
  receivingProgress,
  receivedAudioFiles,
  refreshOnlineUsers,
  call,
  answer,
  reject,
  hangup,
  sendAudioFile,
} = useWebRTC()

const remoteAudioRef = ref<HTMLAudioElement | null>(null)
const ticker = ref(0)
const onlineTargets = computed(() =>
  onlineUserIds.value.map((id) => ({
    id,
    label: id === auth.user?.id ? `${id}（我）` : id,
  })),
)

const durationLabel = computed(() => {
  void ticker.value
  const total = callDurationSec.value
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

let timer: number | null = null

onMounted(() => {
  void refreshOnlineUsers()
  timer = window.setInterval(() => {
    ticker.value += 1
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }
})

watch(
  () => remoteStream.value,
  (stream) => {
    if (remoteAudioRef.value) {
      remoteAudioRef.value.srcObject = stream ?? null
      void remoteAudioRef.value.play().catch(() => {})
    }
  },
)

watch(
  () => recordedBlob.value,
  (blob) => {
    if (blob && blob.size > 0) {
      Message.success('通话录音已生成')
    }
  },
)

function handleCall(userId: string) {
  void call(userId)
}

function handleAnswer() {
  answer()
}

function handleReject() {
  reject()
}

function handleHangup() {
  void hangup()
}

function handlePickAudioFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  void sendAudioFile(file).catch((err) => {
    const msg = err instanceof Error ? err.message : '发送音频文件失败'
    Message.error(msg)
  })
  input.value = ''
}
</script>

<template>
  <div class="voice-call-view">
    <a-space direction="vertical" size="large" fill>
      <a-card title="在线用户">
        <template #extra>
          <a-button type="outline" size="small" @click="refreshOnlineUsers">刷新</a-button>
        </template>
        <a-list :data="onlineTargets" :max-height="280" bordered>
          <template #item="{ item }">
            <a-list-item>
              <a-space>
                <a-tag color="green">在线</a-tag>
                <span>{{ item.label }}</span>
              </a-space>
              <template #actions>
                <a-button
                  type="primary"
                  size="small"
                  :loading="callingUserId === item.id"
                  :disabled="Boolean(activeUserId)"
                  @click="handleCall(item.id)"
                >
                  呼叫
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </a-card>

      <a-card title="通话状态">
        <a-space direction="vertical" size="medium">
          <div v-if="activeUserId">
            <a-tag color="arcoblue">通话中</a-tag>
            <span class="status-text">对方：{{ activeUserId }}</span>
            <span class="status-text">时长：{{ durationLabel }}</span>
          </div>
          <div v-else-if="callingUserId">
            <a-tag color="gold">呼叫中</a-tag>
            <span class="status-text">正在呼叫：{{ callingUserId }}</span>
          </div>
          <div v-else>
            <a-tag>空闲</a-tag>
          </div>
          <a-button type="outline" status="danger" :disabled="!activeUserId" @click="handleHangup">挂断</a-button>
          <a-tag v-if="isTranscribing" color="gold">录音转写中...</a-tag>
          <a-alert
            v-if="transcribedText"
            type="info"
            show-icon
            title="最近一次转写结果"
            :content="transcribedText"
          />
        </a-space>
      </a-card>

      <a-card title="音频文件发送">
        <a-space direction="vertical" size="medium" fill>
          <div class="hint-text">支持 mp3 / wav / ogg / m4a / webm</div>
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg,.m4a,.webm"
            :disabled="!activeUserId || isSendingAudioFile"
            @change="handlePickAudioFile"
          />
          <a-progress
            v-if="isSendingAudioFile"
            :percent="sendingProgress"
            :show-text="true"
            status="normal"
          />
          <div v-if="isSendingAudioFile" class="hint-text">正在发送：{{ sendingFileName }}</div>
          <a-progress
            v-if="receivingProgress > 0 && receivingProgress < 100"
            :percent="receivingProgress"
            :show-text="true"
            status="normal"
          />
        </a-space>
      </a-card>

      <a-card title="接收到的音频">
        <a-empty v-if="receivedAudioFiles.length === 0" description="暂无接收文件" />
        <a-list v-else :data="receivedAudioFiles" bordered>
          <template #item="{ item }">
            <a-list-item>
              <a-space direction="vertical" fill>
                <div>
                  <a-tag color="green">已接收</a-tag>
                  <span class="status-text">{{ item.name }}</span>
                  <span class="status-text">{{ Math.ceil(item.size / 1024) }} KB</span>
                </div>
                <audio :src="item.objectUrl" controls preload="metadata" />
              </a-space>
            </a-list-item>
          </template>
        </a-list>
      </a-card>
    </a-space>

    <a-modal
      :visible="Boolean(incomingCall)"
      title="来电提醒"
      :mask-closable="false"
      :esc-to-close="false"
      :footer="false"
    >
      <a-space direction="vertical" size="large" fill>
        <div>收到来自 {{ incomingCall?.callerUserId }} 的语音来电</div>
        <a-space>
          <a-button type="primary" @click="handleAnswer">接听</a-button>
          <a-button status="danger" @click="handleReject">拒绝</a-button>
        </a-space>
      </a-space>
    </a-modal>

    <audio ref="remoteAudioRef" autoplay playsinline />
  </div>
</template>

<style scoped>
.voice-call-view {
  width: 100%;
}

.status-text {
  margin-left: 8px;
}

.hint-text {
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
