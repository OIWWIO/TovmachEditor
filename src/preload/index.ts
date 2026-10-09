import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  openPakDialog: () => ipcRenderer.invoke('dialog:openPak'),
  selectFolderDialog: () => ipcRenderer.invoke('dialog:selectFolder'),
  savePakDialog: () => ipcRenderer.invoke('dialog:savePak'),
  readPakEntry: (pakPath: string, entry: any) => ipcRenderer.invoke('pak:readEntry', pakPath, entry),
  scanLocalFolder: (dirPath: string) => ipcRenderer.invoke('local:scanFolder', dirPath),
  deleteLocalFolder: (dirPath: string) => ipcRenderer.invoke('local:deleteFolder', dirPath),
  readLocalFile: (fullPath: string) => ipcRenderer.invoke('local:readFile', fullPath),
  writeLocalFile: (fullPath: string, content: string) => ipcRenderer.invoke('local:writeFile', fullPath, content),
  searchAndReplace: (dirPath: string, searchStr: string, replaceStr: string, useRegex: boolean, matchCase: boolean) => ipcRenderer.invoke('local:searchAndReplace', dirPath, searchStr, replaceStr, useRegex, matchCase),
  searchInFiles: (dirPath: string, searchStr: string, useRegex: boolean, matchCase: boolean) => ipcRenderer.invoke('local:searchInFiles', dirPath, searchStr, useRegex, matchCase),
  universalUnpack: (projectDir: string, outPath: string) => ipcRenderer.invoke('local:universalUnpack', projectDir, outPath),
  universalRebuild: (projectDir: string, dictPath: string) => ipcRenderer.invoke('local:universalRebuild', projectDir, dictPath),
  onProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('pak:progress', handler)
    return () => ipcRenderer.removeListener('pak:progress', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) { console.error(error) }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
