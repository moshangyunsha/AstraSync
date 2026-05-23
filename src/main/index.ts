import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { insertRawLog, getTodayDashboardData } from './db'
import { startSystemFocusProbe } from './probe'
import { startGitCommitProbe } from './git'
import { parseRawLog } from './parser'
import { startGraphSyncEngine, closeGraphConnection } from './graph'

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

  startSystemFocusProbe()
  startGitCommitProbe()
  startGraphSyncEngine()

  ipcMain.handle('fetch-dashboard', () => {
    return getTodayDashboardData()
  })

  ipcMain.handle('save-log', (_, text) => {
    const insertId = insertRawLog(text)
    console.log(`\n[数据库] 成功写入日志 ID: ${insertId} -> 内容: ${text}`)
    
    parseRawLog(insertId, text)
    
    return insertId
  })

  ipcMain.on('hide-window', (event) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender)
    if (mainWindow) {
      mainWindow.hide()
    }
  })

  createWindow()

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
      mainWindow.webContents.send('refresh-dashboard')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeGraphConnection()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})