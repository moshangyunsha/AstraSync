<script setup lang="ts">
import { ref, onMounted } from 'vue'

const logInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const dashboardData = ref({
  timeline: [] as any[],
  stats: { manual: 0, focusSwitches: 0, git: { commits: 0, insertions: 0, deletions: 0 } }
})

const fetchDashboard = async () => {
  try {
    dashboardData.value = await window.electron.ipcRenderer.invoke('fetch-dashboard')
  } catch (error) {
    console.error('获取仪表盘数据失败', error)
  }
}

onMounted(() => {
  inputRef.value?.focus()
  fetchDashboard()
  window.addEventListener('focus', () => {
    inputRef.value?.focus()
    fetchDashboard()
  })
})

const submitLog = () => {
  const text = logInput.value.trim()
  if (!text) return
  window.electron.ipcRenderer.send('save-log', text)
  logInput.value = ''
  setTimeout(fetchDashboard, 100) // 延迟刷新以确保底层 SQLite 写入完成
}

const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="h-screen w-screen bg-neutral-950 flex flex-col font-sans text-neutral-200 select-none overflow-hidden p-6">
    
    <header class="w-full flex-none mb-8">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-3xl font-extrabold tracking-tight bg-linear-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">AstraSync</h1>
        <span class="text-neutral-500 text-xs font-mono tracking-widest">{{ new Date().toLocaleDateString('zh-CN') }}</span>
      </div>
      <input
        ref="inputRef"
        v-model="logInput"
        @keyup.enter="submitLog"
        type="text"
        placeholder="记录活动轨迹... (Enter 提交)"
        class="w-full bg-neutral-900/80 border border-neutral-700/50 rounded-xl px-6 py-4 text-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 backdrop-blur-md transition-all shadow-lg"
      />
    </header>

    <main class="flex-1 grid grid-cols-12 gap-6 min-h-0">
      
      <section class="col-span-4 flex flex-col gap-4">
        <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5">
          <h2 class="text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-3">代码产出 (Today)</h2>
          <div class="flex items-end gap-2">
            <span class="text-4xl font-bold text-neutral-100">{{ dashboardData.stats.git.commits }}</span>
            <span class="text-neutral-400 text-sm mb-1">Commits</span>
          </div>
          <div class="flex gap-4 mt-2 text-sm">
            <span class="text-emerald-400 font-mono">+{{ dashboardData.stats.git.insertions }}</span>
            <span class="text-rose-400 font-mono">-{{ dashboardData.stats.git.deletions }}</span>
          </div>
        </div>

        <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5">
          <h2 class="text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-3">系统活跃</h2>
          <div class="flex items-end gap-2">
            <span class="text-3xl font-bold text-neutral-100">{{ dashboardData.stats.focusSwitches }}</span>
            <span class="text-neutral-400 text-sm mb-1">次焦点切换</span>
          </div>
        </div>

        <div class="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5">
          <h2 class="text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-3">手动录入</h2>
          <div class="flex items-end gap-2">
            <span class="text-3xl font-bold text-cyan-500">{{ dashboardData.stats.manual }}</span>
            <span class="text-neutral-400 text-sm mb-1">条记录</span>
          </div>
        </div>
      </section>

      <section class="col-span-8 bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 overflow-hidden flex flex-col">
        <h2 class="text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-4 flex-none">Timeline</h2>
        <div class="flex-1 overflow-y-auto pr-2 space-y-4">
          <div v-for="item in dashboardData.timeline" :key="`${item.type}-${item.id}`" class="flex gap-4 items-start group">
            <span class="text-neutral-500 font-mono text-sm mt-0.5 w-12 shrink-0">{{ formatTime(item.created_at) }}</span>
            
            <div class="flex flex-col relative w-full">
              <span class="text-neutral-200 text-sm font-medium leading-relaxed" 
                    :class="{'text-cyan-400': item.type === 'manual', 'text-emerald-400': item.type === 'git'}">
                {{ item.title }}
              </span>
              <span v-if="item.subtitle" class="text-neutral-500 text-xs mt-1 line-clamp-1 group-hover:line-clamp-none transition-all">
                {{ item.subtitle }}
              </span>
            </div>
          </div>
          
          <div v-if="dashboardData.timeline.length === 0" class="h-full flex items-center justify-center text-neutral-600 text-sm">
            暂无活动数据
          </div>
        </div>
      </section>
      
    </main>
  </div>
</template>