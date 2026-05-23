import { powerMonitor } from 'electron'
import { insertFocusLog } from './db'

let lastAppName = ''
let lastWindowTitle = ''

export function startSystemFocusProbe() {
  console.log('[系统探针] 窗口焦点监听服务已启动...')

  setInterval(async () => {
    try {
      // 硬件级休眠拦截：如果键鼠无操作超过 60 秒，直接挂起本次轮询
      if (powerMonitor.getSystemIdleTime() > 60) return

      // 利用动态 import 规避 CommonJS 与纯 ESM 的模块系统冲突，提取 default 导出
      const { default: activeWindow } = await import('active-win')
      const window = await activeWindow()
      
      if (!window) return

      // 过滤 AstraSync 自身，防止死循环记录
      if (window.owner.name === 'astra-sync.exe' || window.title === 'AstraSync') return

      // 仅在焦点发生实际变更时写入数据库
      if (window.owner.name !== lastAppName || window.title !== lastWindowTitle) {
        lastAppName = window.owner.name
        lastWindowTitle = window.title

        const insertId = insertFocusLog(lastAppName, lastWindowTitle)
        console.log(`[探针录入] ID:${insertId} | 进程: ${lastAppName} | 窗口: ${lastWindowTitle}`)
      }
    } catch (error) {
      console.error('[系统探针] 获取底层窗口句柄失败:', error)
    }
  }, 2000)
}