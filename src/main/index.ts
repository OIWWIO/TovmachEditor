import { smartAlignXml } from '../core/pak/compare'
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readEntries, getEntryContent, extractPakAsync, buildPakAsync } from '../core/pak'
import { aionBxmlDecodeFile } from '../core/pak/aionTools.js'
import { extractAllStrings, rebuildAllStrings } from '../core/pak/universalTranslator'

let mainWindow: BrowserWindow | null = null
function createWindow(): void {
  mainWindow = new BrowserWindow({ icon: join(__dirname, '../../build/icon.png'),  width: 1024, height: 768, minWidth: 640, minHeight: 480, show: false, frame: false, titleBarStyle: 'hidden', backgroundColor: '#0C0C0D',
    webPreferences: { preload: join(__dirname, '../preload/index.mjs'), sandbox: false, contextIsolation: true, nodeIntegration: false } })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => { require('electron').shell.openExternal(details.url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) { mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']) } else { mainWindow.loadFile(join(__dirname, '../renderer/index.html')) }
}

function decodeFileBytes(buf: Buffer): string {
  try {
    const res = aionBxmlDecodeFile(buf)
    if (res.decoded) buf = Buffer.from(res.data)
  } catch(e) { console.error("BXML decode failed", e) }

  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le').replace(/^\uFEFF/, '')
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.toString('utf8').replace(/^\uFEFF/, '')
  let nulls = 0;
  for (let i = 1; i < Math.min(buf.length, 100); i += 2) if (buf[i] === 0) nulls++
  if (nulls > 10) return buf.toString('utf16le')
  return buf.toString('utf8')
}

function walkDir(dir: string, base: string = ''): any[] {
  let results: any[] = []
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    const fullPath = join(dir, file)
    const relPath = base ? base + '/' + file : file
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, relPath))
    } else {
      results.push({ name: relPath, fullPath })
    }
  })
  return results
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow?.unmaximize(); else mainWindow?.maximize() })
  ipcMain.on('window:close', () => mainWindow?.close())

  ipcMain.handle('dialog:openPak', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'PAK Files', extensions: ['pak', 'disabled'] }] })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const raw = fs.readFileSync(result.filePaths[0])
      return { pakPath: result.filePaths[0], entries: readEntries(raw) }
    } catch (err) { console.error(err); return null }
  })
  
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  
  ipcMain.handle('dialog:savePak', async () => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, { filters: [{ name: 'PAK Files', extensions: ['pak'] }] })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('pak:readEntry', async (_, pakPath, entry) => {
    try {
      return decodeFileBytes(getEntryContent(pakPath, entry))
    } catch (err: any) { return 'Error reading file: ' + err.message }
  })

      ipcMain.handle('local:universalUnpack', async (e, projectDir, outPath) => {
    return new Promise((resolve) => {
      extractAllStrings(projectDir, outPath, (current, total, msg) => {
        e.sender.send('pak:progress', { current, total, type: 'extract', fileName: msg })
      }).then(() => resolve(true)).catch(err => {
        console.error(err);
        e.sender.send('unpack-progress', '�������: ' + err.message)
        resolve(false)
      })
    })
  })

  ipcMain.handle('local:universalRebuild', async (e, projectDir, dictPath) => {
    return new Promise((resolve) => {
      rebuildAllStrings(projectDir, dictPath, (current, total, msg) => {
        e.sender.send('pak:progress', { current, total, type: 'extract', fileName: msg })
      }).then(() => resolve(true)).catch(err => {
        console.error(err);
        e.sender.send('unpack-progress', '�������: ' + err.message)
        resolve(false)
      })
    })
  })

  ipcMain.handle('local:deleteFolder', async (_, dirPath) => {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true })
      }
      return true
    } catch(err) {
      console.error(err)
      return false
    }
  })
  ipcMain.handle('local:scanFolder', async (_, dirPath) => {
    try {
      return walkDir(dirPath)
    } catch(err) { console.error(err); return [] }
  })

  ipcMain.handle('local:readFile', async (_, fullPath) => {
    try {
      const buf = fs.readFileSync(fullPath)
      return decodeFileBytes(buf)
    } catch (err: any) { return 'Error reading file: ' + err.message }
  })

  ipcMain.handle('local:writeFile', async (_, fullPath, content) => {
    try {
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, content, 'utf8')
        return true
      }
      const buf = fs.readFileSync(fullPath)
      const hasBom16 = buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE
      const hasBom8 = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
      let nullCount = 0;
      for(let i=1; i<Math.min(buf.length, 100); i+=2) if (buf[i]===0) nullCount++;
      const isUtf16Le = hasBom16 || nullCount > 10;
      
      let outBuf;
      if (isUtf16Le) {
          const textBuf = Buffer.from(content, 'utf16le')
          outBuf = hasBom16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), textBuf]) : textBuf
      } else {
          const textBuf = Buffer.from(content, 'utf8')
          outBuf = hasBom8 ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), textBuf]) : textBuf
      }
      fs.writeFileSync(fullPath, outBuf)
      return true
    } catch (err) { console.error(err); return false }
  })

  ipcMain.handle('local:searchAndReplace', async (_, dirPath, searchStr, replaceStr, useRegex, matchCase) => {
    try {
      const files = walkDir(dirPath)
      let replacedFilesCount = 0
      let totalMatches = 0
      let modifiedFiles: string[] = []

      let searchRegex: RegExp;
      if (useRegex) {
        searchRegex = new RegExp(searchStr, matchCase ? 'g' : 'gi');
      } else {
        const escaped = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }

      for (const f of files) {
        if (!f.fullPath) continue
        const buf = fs.readFileSync(f.fullPath)
        const content = decodeFileBytes(buf)
        
        let matches = 0;
        const newContent = content.replace(searchRegex, (match) => {
          matches++;
          return replaceStr;
        });

        if (matches > 0 && newContent !== content) {
          totalMatches += matches;
          replacedFilesCount++;
          modifiedFiles.push(f.fullPath);
          
          const hasBom16 = buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE
          const hasBom8 = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
          let nullCount = 0;
          for(let i=1; i<Math.min(buf.length, 100); i+=2) if (buf[i]===0) nullCount++;
          const isUtf16Le = hasBom16 || nullCount > 10;
          
          let outBuf;
          if (isUtf16Le) {
              const textBuf = Buffer.from(newContent, 'utf16le')
              outBuf = hasBom16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), textBuf]) : textBuf
          } else {
              const textBuf = Buffer.from(newContent, 'utf8')
              outBuf = hasBom8 ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), textBuf]) : textBuf
          }
          fs.writeFileSync(f.fullPath, outBuf)
        }
      }
      return { success: true, replacedFilesCount, totalMatches, modifiedFiles }
    } catch (err: any) { 
      console.error(err); 
      return { success: false, error: err.message } 
    }
  })
  ipcMain.handle('local:searchInFiles', async (_, dirPath, searchStr, useRegex, matchCase) => {
    try {
      const files = walkDir(dirPath)
      let results: any[] = []

      let searchRegex: RegExp;
      if (useRegex) {
        searchRegex = new RegExp(searchStr, matchCase ? 'g' : 'gi');
      } else {
        const escaped = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }

      for (const f of files) {
        if (!f.fullPath) continue
        const buf = fs.readFileSync(f.fullPath)
        const content = decodeFileBytes(buf)
        
        let match;
        let fileMatches: any[] = [];
        const lines = content.split(/\r?\n/);
        
        // Simpler line-by-line search to get line context easily
        lines.forEach((line, index) => {
          searchRegex.lastIndex = 0;
          if (searchRegex.test(line)) {
            fileMatches.push({ line: index + 1, text: line });
          }
        });

        if (fileMatches.length > 0) {
          results.push({
            fullPath: f.fullPath,
            name: f.name,
            matches: fileMatches
          })
        }
      }
      return { success: true, results }
    } catch (err: any) { 
      console.error(err); 
      return { success: false, error: err.message } 
    }
  })

  ipcMain.handle('pak:compareFile', async (_, sourcePath, refPakPath, entryName) => {
    try {
      // Read the source XML from local disk
      const sourceBuf = fs.readFileSync(sourcePath)
      const sourceXml = decodeFileBytes(sourceBuf)
      
      // Read the reference XML from the selected PAK
      
      const raw = fs.readFileSync(refPakPath)
      const entries = readEntries(raw)
      const e = entries.find(x => x.name.replace(/\\/g, '/') === entryName.replace(/\\/g, '/'))
      
      if (!e) return { error: 'Файл не знайдено в еталонному .pak' }
      
      const refBuf = getEntryContent(refPakPath, e)
      const refXml = decodeFileBytes(refBuf)
      
      const alignedRefXml = smartAlignXml(sourceXml, refXml)
      return { alignedRefXml, sourceXml }
    } catch (err: any) {
      console.error(err)
      return { error: err.message }
    }
  })

  ipcMain.handle('pak:extractAll', async (event, pakPath, outDir) => {
    try {
      await extractPakAsync(pakPath, outDir, (current, total, fileName) => {
        event.sender.send('pak:progress', { type: 'extract', current, total, fileName })
      })
      return true
    } catch (e) { console.error(e); return false }
  })

  ipcMain.handle('pak:build', async (event, inDir, outPak, originalPak) => {
    try {
      await buildPakAsync(inDir, outPak, originalPak, (current, total, fileName) => {
        event.sender.send('pak:progress', { type: 'build', current, total, fileName })
      })
      return true
    } catch (e) { console.error(e); return false }
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })



