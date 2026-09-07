import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { seedIfNeeded } from './seed'

const isDev = !app.isPackaged

/**
 * A fixed 1000x720 default looks cramped on any modern display and tiny on a 27" one. Size to
 * the screen instead: most of the work area (which already excludes the menu bar and Dock),
 * capped so it doesn't become an unreadably wide single column on an ultrawide.
 */
function defaultWindowSize(): { width: number; height: number } {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return {
    width: Math.min(1600, Math.round(width * 0.9)),
    height: Math.min(1040, Math.round(height * 0.9))
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    ...defaultWindowSize(),
    center: true,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // CHINESE_ANKI_DB_PATH lets dev/smoke runs point at a scratch database instead of the real one.
  initDatabase(process.env['CHINESE_ANKI_DB_PATH'])
  seedIfNeeded()
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
