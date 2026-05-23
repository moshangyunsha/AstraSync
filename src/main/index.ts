import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { insertRawLog, getRecentLogs, getTodayDashboardData } from './db'
import { startSystemFocusProbe } from './probe'
import { startGitCommitProbe } from './git'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 激活所有底层自动化探针
  startSystemFocusProbe()
  startGitCommitProbe()

  // 拦截前端自然语言日志提交请求
  ipcMain.on('save-log', (event, text) => {
    const insertId = insertRawLog(text)
    const recentLogs = getRecentLogs(3)
    
    console.log(`\n[数据库] 成功写入日志 ID: ${insertId} -> 内容: ${text}`)
    console.log('[数据库] 当前最近的 3 条记录:', recentLogs, '\n')
    
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (mainWindow) {
      mainWindow.hide()
    }
  })

  // 注册仪表盘数据拉取接口
  ipcMain.handle('fetch-dashboard', () => {
    return getTodayDashboardData()
  })

  createWindow()

  // 注册全局物理唤醒快捷键
  globalShortcut.register('Alt+Space', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      createWindow()
      return
    }
    
    const mainWindow = windows[0]
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})