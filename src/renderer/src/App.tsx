import { useState, useRef, useEffect } from 'react'
import { Search, ChevronRight, ChevronDown, Folder, File, Undo2, Redo2, Minus, Square, X as CloseIcon, FolderOpen, DownloadCloud, UploadCloud, Plus, Menu, Trash2, FileText, Save, Globe } from 'lucide-react'
import Editor, { useMonaco, DiffEditor } from '@monaco-editor/react'
import { translations } from './i18n'

import './App.css'

interface Project { id: string; name: string; pakPath: string | null; extractDir: string | null }
interface Tab { isDiff?: boolean; originalContent?: string; id: string; name: string; content: string; isDirty: boolean; source: 'pak' | 'local'; fullPath?: string; entry?: any }
interface TreeNode { name: string; path: string; isFolder: boolean; children?: TreeNode[]; entry?: any; fullPath?: string; isOpen?: boolean }
interface ProgressState { active: boolean; type: 'extract' | 'build'; current: number; total: number; fileName: string }

declare global {
  interface Window {
    api: {
      windowMinimize: () => void; windowMaximize: () => void; windowClose: () => void;
      openPakDialog: () => Promise<{pakPath: string, entries: any[]} | null>;
      selectFolderDialog: () => Promise<string | null>;
      savePakDialog: () => Promise<string | null>;
      readPakEntry: (pakPath: string, entry: any) => Promise<string>;
      scanLocalFolder: (dirPath: string) => Promise<any[]>;
      deleteLocalFolder: (dirPath: string) => Promise<boolean>;
      readLocalFile: (fullPath: string) => Promise<string>;
      writeLocalFile: (fullPath: string, content: string) => Promise<boolean>;
      searchAndReplace: (dirPath: string, searchStr: string, replaceStr: string, useRegex: boolean, matchCase: boolean) => Promise<{success: boolean, replacedFilesCount: number, totalMatches: number, modifiedFiles: string[], error?: string}>;
      searchInFiles: (dirPath: string, searchStr: string, useRegex: boolean, matchCase: boolean) => Promise<{success: boolean, results: any[], error?: string}>;
      universalUnpack: (projectDir: string, outPath: string) => Promise<boolean>;
      universalRebuild: (projectDir: string, dictPath: string) => Promise<boolean>;
      onProgress: (callback: (data: any) => void) => () => void;
    }
    electron: { ipcRenderer: { invoke: (channel: string, ...args: any[]) => Promise<any> } }
  }
}

function buildTreeFromEntries(entries: any[]): TreeNode[] {
  const root: TreeNode = { name: 'root', path: '', isFolder: true, children: [], isOpen: true }
  entries.forEach(entry => {
    const parts = entry.name.split(/[/\\]/)
    let current = root
    parts.forEach((part: string, index: number) => {
      const isLast = index === parts.length - 1
      let child = current.children?.find(c => c.name === part)
      if (!child) {
        child = { name: part, path: parts.slice(0, index + 1).join('/'), isFolder: !isLast, isOpen: false, ...(isLast ? { entry } : { children: [] }) }
        current.children!.push(child)
      }
      current = child
    })
  })
  return root.children || []
}

function buildTreeFromLocal(files: any[]): TreeNode[] {
  const root: TreeNode = { name: 'root', path: '', isFolder: true, children: [], isOpen: true }
  files.forEach(f => {
    const parts = f.name.split(/[/\\]/)
    let current = root
    parts.forEach((part: string, index: number) => {
      const isLast = index === parts.length - 1
      let child = current.children?.find(c => c.name === part)
      if (!child) {
        child = { name: part, path: parts.slice(0, index + 1).join('/'), isFolder: !isLast, isOpen: false, ...(isLast ? { fullPath: f.fullPath } : { children: [] }) }
        current.children!.push(child)
      }
      current = child
    })
  })
  return root.children || []
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1
    if (!a.isFolder && b.isFolder) return 1
    return a.name.localeCompare(b.name)
  })
  nodes.forEach(n => { if (n.children) sortTree(n.children) })
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptVal, setPromptVal] = useState('')

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [gsSearchStr, setGsSearchStr] = useState('')
  const [gsReplaceStr, setGsReplaceStr] = useState('')
  const [gsUseRegex, setGsUseRegex] = useState(false)
  const [gsMatchCase, setGsMatchCase] = useState(false)
  const [gsStatus, setGsStatus] = useState('')
  
  const [gsMode, setGsMode] = useState<'find' | 'replace'>('find')
  const [searchResults, setSearchResults] = useState<{fullPath: string, name: string, matches: {line: number, text: string}[]}[] | null>(null)

  const [localSearch, setLocalSearch] = useState('')
  const [localMatches, setLocalMatches] = useState<any[]>([])
  const [localMatchIdx, setLocalMatchIdx] = useState(0)
  const localDecorationsRef = useRef<any[]>([])

  const [lang, setLang] = useState<'uk' | 'en' | 'de' | 'fr'>('uk')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [showViewMenu, setShowViewMenu] = useState(false)
  const [viewOptions, setViewOptions] = useState({ whitespace: false, lineEndings: false, nonPrintable: false, controlChars: false })
  const viewOptionsRef = useRef(viewOptions);
  useEffect(() => {
    viewOptionsRef.current = viewOptions;
  }, [viewOptions]);
  
  const t = (key: string): string => {
    return (translations[lang] as any)[key] || key;
  }

  const [tree, setTree] = useState<TreeNode[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editorStats, setEditorStats] = useState({ line: 1, column: 1, selLength: 0, totalLines: 0, totalLength: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [showSeparators, setShowSeparators] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ active: false, type: 'extract', current: 0, total: 0, fileName: '' })
  const editorRef = useRef<any>(null)
  const viewDecorationsRef = useRef<any[]>([])

  const updateViewDecorations = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    
    editor.updateOptions({
      renderWhitespace: viewOptionsRef.current.whitespace ? 'all' : 'selection',
      renderControlCharacters: (viewOptionsRef.current.nonPrintable || viewOptionsRef.current.controlChars),
      unicodeHighlight: {
        invisibleCharacters: false,
        ambiguousCharacters: false,
        nonBasicASCII: false
      }
    });

    const model = editor.getModel();
    if (model) {
      let decs = [];
      if (viewOptionsRef.current.lineEndings) {
        const lineCount = model.getLineCount();
        const eol = model.getEOL() === '\r\n' ? 'CRLF' : 'LF';
        const decClass = eol === 'CRLF' ? 'crlf-decoration' : 'lf-decoration';
        for (let i = 1; i <= lineCount; i++) {
          const col = model.getLineMaxColumn(i);
          decs.push({
            range: { startLineNumber: i, startColumn: col, endLineNumber: i, endColumn: col },
            options: { afterContentClassName: decClass }
          });
        }
      }
        if (viewOptionsRef.current.whitespace) {
          const matches = model.findMatches('\t', false, false, false, null, true);
          matches.forEach(m => {
            decs.push({
              range: m.range,
              options: { inlineClassName: 'custom-tab-arrow' }
            });
          });
        }
      viewDecorationsRef.current = editor.deltaDecorations(viewDecorationsRef.current, decs);
    }
  };

  useEffect(() => {
    updateViewDecorations();
  }, [viewOptions, activeTabId]);

  useEffect(() => {
    const savedLang = localStorage.getItem('tovmach-lang') as any;
    if (savedLang && ['uk', 'en', 'de', 'fr'].includes(savedLang)) setLang(savedLang);

    const saved = localStorage.getItem('tovmach-projects')
    let currentProjectId = activeProjectId;
    if (saved) {
      const p = JSON.parse(saved)
      setProjects(p)
      if (p.length > 0 && !activeProjectId) {
        setActiveProjectId(p[0].id)
        currentProjectId = p[0].id;
      }
    } else {
      const defProj = { id: Date.now().toString(), name: 'Проєкт 1', pakPath: null, extractDir: null }
      setProjects([defProj])
      setActiveProjectId(defProj.id)
      currentProjectId = defProj.id;
      localStorage.setItem('tovmach-projects', JSON.stringify([defProj]))
    }

    if (currentProjectId) {
      const savedTabs = localStorage.getItem(`tovmach-tabs-${currentProjectId}`);
      if (savedTabs) {
        try {
          const parsedTabs = JSON.parse(savedTabs);
          // Load contents for the restored tabs
          Promise.all(parsedTabs.map(async (t: any) => {
            let content = '';
            if (t.fullPath) {
              try { content = await window.api.readLocalFile(t.fullPath) } catch(e) {}
            }
            return { ...t, content, isDirty: false };
          })).then(loadedTabs => {
            setTabs(loadedTabs);
            const savedActiveTab = localStorage.getItem(`tovmach-activetab-${currentProjectId}`);
            if (savedActiveTab && loadedTabs.some((t: any) => t.id === savedActiveTab)) {
              setActiveTabId(savedActiveTab);
            } else if (loadedTabs.length > 0) {
              setActiveTabId(loadedTabs[0].id);
            }
          });
        } catch(e) { console.error("Failed to restore tabs", e); }
      }
    }
    
    // Drag & Drop
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files) as any[];
      if (files.length > 0) {
        for (const file of files) {
          if (file.path) {
            try {
              const content = await window.api.readLocalFile(file.path);
              const fileName = file.path.split(/[/\\]/).pop() || 'file';
              setTabs(prev => {
                if (prev.find(t => t.fullPath === file.path)) return prev;
                const newTab: Tab = { id: file.path, name: fileName, content, isDirty: false, source: 'local', fullPath: file.path };
                setActiveTabId(newTab.id);
                return [...prev, newTab];
              });
            } catch (err) {
              console.error("Could not read dropped file", err);
            }
          }
        }
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    }
  }, [])

  // Save tabs on change
  useEffect(() => {
    if (activeProjectId) {
      const tabsToSave = tabs.map(t => ({ id: t.id, name: t.name, source: t.source, fullPath: t.fullPath, entry: t.entry }));
      localStorage.setItem(`tovmach-tabs-${activeProjectId}`, JSON.stringify(tabsToSave));
      localStorage.setItem(`tovmach-activetab-${activeProjectId}`, activeTabId);
    }
  }, [tabs, activeTabId, activeProjectId])

  const changeLang = (l: 'uk'|'en'|'de'|'fr') => {
    setLang(l);
    localStorage.setItem('tovmach-lang', l);
    setShowLangMenu(false);
  }

  const activeProject = projects.find(p => p.id === activeProjectId)

  const saveProjects = (newProjects: Project[]) => {
    setProjects(newProjects)
    localStorage.setItem('tovmach-projects', JSON.stringify(newProjects))
  }

  const handleCreateProjectClick = () => {
    setPromptVal('Проєкт ' + (projects.length + 1))
    setPromptOpen(true)
  }

  const handleCreateProjectSubmit = () => {
    const name = promptVal.trim() || 'Проєкт ' + (projects.length + 1)
    const newProj = { id: Date.now().toString(), name, pakPath: null, extractDir: null }
    saveProjects([...projects, newProj])
    setActiveProjectId(newProj.id)
    setTree([])
    setTabs([])
    setPromptOpen(false)
  }

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id)
    setShowProjectMenu(false)
    setTree([])
    setTabs([])
  }

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const p = projects.find(x => x.id === id)
    if (p && p.extractDir) {
      const confirmed = window.confirm('Ви впевнені, що хочете видалити проєкт та всі розпаковані файли (' + p.extractDir + ')?')
      if (!confirmed) return
      await window.api.deleteLocalFolder(p.extractDir)
    }
    const newProjects = projects.filter(x => x.id !== id)
    saveProjects(newProjects)
    if (activeProjectId === id) {
      if (newProjects.length > 0) setActiveProjectId(newProjects[0].id)
      else setActiveProjectId('')
      setTree([])
      setTabs([])
    }
    if (newProjects.length === 0) setShowProjectMenu(false)
  }

  useEffect(() => {
    if (activeProject) {
      if (activeProject.extractDir) {
        window.api.scanLocalFolder(activeProject.extractDir).then(files => {
          const t = buildTreeFromLocal(files); sortTree(t); setTree(t)
        })
      } else if (activeProject.pakPath) {
        // ...
      }
    }
  }, [activeProjectId, activeProject?.extractDir])

  useEffect(() => {
    if (window.api && window.api.onProgress) {
      return window.api.onProgress((data: any) => {
        setProgress({ active: data.current < data.total, type: data.type, current: data.current, total: data.total, fileName: data.fileName })
      })
    }
  }, [])

  const handleClose = () => window.api.windowClose()
  const handleMinimize = () => window.api.windowMinimize()
  const handleMaximize = () => window.api.windowMaximize()

  const handleOpenPak = async () => {
    if (!activeProject) return
    const result = await window.api.openPakDialog()
    if (result) {
      const updated = projects.map(p => p.id === activeProjectId ? { ...p, pakPath: result.pakPath } : p)
      saveProjects(updated)
      const t = buildTreeFromEntries(result.entries); sortTree(t); setTree(t)
    }
  }

  const handleExtractAll = async () => {
    if (!activeProject || !activeProject.pakPath) return
    const baseDir = await window.api.selectFolderDialog()
    if (!baseDir) return
    
    // Auto-append project name to the selected path
    const targetDir = baseDir + '\\' + activeProject.name
    
    setProgress({ active: true, type: 'extract', current: 0, total: 100, fileName: 'Підготовка...' })
    try {
      const res = await window.electron.ipcRenderer.invoke('pak:extractAll', activeProject.pakPath, targetDir); if (res && res.error) throw new Error(res.error);
      const updated = projects.map(p => p.id === activeProjectId ? { ...p, extractDir: targetDir } : p)
      saveProjects(updated)
      const files = await window.api.scanLocalFolder(targetDir)
      const t = buildTreeFromLocal(files); sortTree(t); setTree(t)
      setTabs([])
    } catch (e: any) { console.error(e); alert('Extract Error: ' + (e.message || e)) } finally { setProgress(prev => ({ ...prev, active: false })) }
  }

    const handleUniversalUnpack = async () => {
    if (!activeProject?.extractDir) return
    setProgress({ active: true, type: 'extract', current: 0, total: 100, fileName: 'Обробка текстів...' })
    const outPath = activeProject.extractDir + '\\_universal_texts'
    const success = await window.api.universalUnpack(activeProject.extractDir, outPath)
    if (success) {
      const files = await window.api.scanLocalFolder(activeProject.extractDir);
      const newTree = buildTreeFromLocal(files);
      sortTree(newTree);
      setTree(prev => {
        const mergeState = (oldN, newN) => {
          return newN.map(nn => {
            const on = oldN.find(o => o.path === nn.path);
            if (on) {
              nn.isOpen = on.isOpen;
              if (nn.children && on.children) nn.children = mergeState(on.children, nn.children);
            }
            return nn;
          });
        };
        return mergeState(prev, newTree);
      });
    } else {
      alert('Помилка при експорті')
    }
    setProgress({ active: false, type: 'extract', current: 100, total: 100, fileName: '' })
  }

  const handleUniversalRebuild = async () => {
    if (!activeProject?.extractDir) return
    setProgress({ active: true, type: 'extract', current: 0, total: 100, fileName: 'Обробка текстів...' })
    const dictPath = activeProject.extractDir + '\\_universal_texts'
    const success = await window.api.universalRebuild(activeProject.extractDir, dictPath)
    if (success) {
      alert('Успіх! Тексти успішно інтегровані у файли гри!')
    } else {
      alert('Помилка при імпорті текстів')
    }
    setProgress({ active: false, type: 'extract', current: 100, total: 100, fileName: '' })
  }

  const handleBuildPak = async () => {
    if (!activeProject) return
    const inDir = activeProject.extractDir || await window.api.selectFolderDialog()
    if (!inDir) return
    const originalPak = activeProject.pakPath || await window.api.openPakDialog().then(res => res?.pakPath)
    if (!originalPak) return
    const outPak = await window.api.savePakDialog()
    if (!outPak) return

    setProgress({ active: true, type: 'build', current: 0, total: 100, fileName: 'Підготовка...' })
    try {
        await window.electron.ipcRenderer.invoke('pak:build', inDir, outPak, originalPak)
        alert('Запаковано успішно!')
      } catch (e: any) { console.error(e); alert('Extract Error: ' + (e.message || e)) } finally { setProgress(prev => ({ ...prev, active: false })) }
      setProgress({ active: false, type: 'build', current: 100, total: 100, fileName: '' })
  }

  const handleFileClick = async (node: TreeNode) => {
    if (!activeProject) return
    if (!node.entry && !node.fullPath) return

    const existingTab = tabs.find(t => t.id === node.path)
    if (existingTab) { setActiveTabId(existingTab.id); return }

    let content = ''
    if (node.fullPath) content = await window.api.readLocalFile(node.fullPath)
    else if (node.entry && activeProject.pakPath) content = await window.api.readPakEntry(activeProject.pakPath, node.entry)

    const newTab: Tab = { id: node.path, name: node.name, content, isDirty: false, source: node.fullPath ? 'local' : 'pak', fullPath: node.fullPath, entry: node.entry }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const toggleFolder = (path: string, nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) return { ...node, isOpen: !node.isOpen }
      if (node.children) return { ...node, children: toggleFolder(path, node.children) }
      return node
    })
  }


  const decorationsRef = useRef<any[]>([]);
  const updateDecorations = (editor: any, monaco: any) => {
      const model = editor.getModel();
      if (!model) return;
      if (!model.uri.path.endsWith('_universal_texts.txt')) return;
      
      const text = model.getValue();
      const regex = /<--\|-->/g;
      let match;
      const newDecorations: any[] = [];
      while ((match = regex.exec(text)) !== null) {
          const startPos = model.getPositionAt(match.index);
          const endPos = model.getPositionAt(match.index + 8);
          newDecorations.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              options: {
                  inlineClassName: 'hidden-separator',
                  isWholeLine: true,
                  className: 'red-bottom-border'
              }
          });
      }
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }

    const defineTheme = (monaco: any) => {
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: {
        'editor.background': '#151517',
        'editor.lineHighlightBackground': '#1C1C1F',
        'editorCursor.foreground': '#007ACC',
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',
        'editor.selectionHighlightBackground': '#264F7855',
        'editor.findMatchBackground': 'rgba(255, 215, 0, 0.2)',
        'editor.findMatchHighlightBackground': 'rgba(255, 215, 0, 0.15)',
        'editorUnicodeHighlight.background': '#00000000',
        'editorUnicodeHighlight.border': '#00000000',
        'editorWhitespace.foreground': '#ff9900',
      },
    })
  }

  const handleEditorDidMount = (editor: any, monacoInst: any) => {
    editorRef.current = editor
        const updateStats = () => {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      const sel = editor.getSelection();
      let selLength = 0;
      if (sel && !sel.isEmpty()) {
        selLength = model.getValueInRange(sel).length;
      }
      setEditorStats({
        line: pos ? pos.lineNumber : 1,
        column: pos ? pos.column : 1,
        selLength,
        totalLines: model.getLineCount(),
        totalLength: model.getValueLength()
      });
    };

    editor.onDidChangeCursorPosition(updateStats);
    editor.onDidChangeCursorSelection(updateStats);
      
    editor.onDidChangeModelContent(() => {
        updateStats();
        updateDecorations(editor, monacoInst);
        updateViewDecorations();
    });
    
    setTimeout(() => { updateStats(); updateViewDecorations(); }, 100);
    updateDecorations(editor, monacoInst);
    updateViewDecorations();
  }


  const activeTab = tabs.find(t => t.id === activeTabId)
  
  const handleSmartCompare = async () => {
    if (!activeTab || !activeProject) return;
    
    // Select reference pak
    const refPak = await window.api.openPakDialog();
    if (!refPak || !refPak.pakPath) return;
    
    setProgress({ active: true, type: 'extract', current: 0, total: 100, fileName: 'Порівняння...' });
    
    try {
      // Use IPC
      const result = await (window as any).electron.ipcRenderer.invoke('pak:compareFile', activeTab.fullPath, refPak.pakPath, activeTab.id);
      
      if (result.error) {
        alert('Помилка: ' + result.error);
      } else {
        setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, isDiff: true, originalContent: result.alignedRefXml } : t));
      }
    } catch (e: any) {
      alert('Помилка: ' + e.message);
    }
    
    setProgress({ active: false, type: 'extract', current: 100, total: 100, fileName: '' });
  }

  const handleSave = async () => {
    if (!activeTab || !activeTab.isDirty) return;
    if (activeTab.source === 'local') {
      const success = await window.api.writeLocalFile(activeTab.fullPath, activeTab.content);
      if (success) {
        setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, isDirty: false } : t));
      } else {
        alert('Помилка збереження файлу');
      }
    } else {
      alert('Збереження файлів безпосередньо в .pak поки не підтримується. Спочатку розпакуйте проєкт.');
    }
  }

  const handleGlobalFind = async (target: 'project' | 'open') => {
    if (target === 'project' && !activeProject?.extractDir) {
      alert('Будь ласка, розпакуйте проєкт перед глобальним пошуком.');
      return;
    }
    if (!gsSearchStr) return;
    setGsStatus('Виконується пошук...');
    setSearchResults(null);

    if (target === 'project') {
      const result = await window.api.searchInFiles(activeProject!.extractDir!, gsSearchStr, gsUseRegex, gsMatchCase);
      if (result.success) {
        setSearchResults(result.results);
        const totalMatches = result.results.reduce((acc, curr) => acc + curr.matches.length, 0);
        setGsStatus(`Готово: знайдено ${totalMatches} збігів у ${result.results.length} файлах.`);
      } else {
        setGsStatus(`Помилка: ${result.error}`);
      }
    } else {
      // Find in open tabs
      let searchRegex: RegExp;
      if (gsUseRegex) {
        searchRegex = new RegExp(gsSearchStr, gsMatchCase ? 'g' : 'gi');
      } else {
        const escaped = gsSearchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, gsMatchCase ? 'g' : 'gi');
      }
      
      const results: any[] = [];
      for (const tab of tabs) {
        const lines = tab.content.split(/\r?\n/);
        const fileMatches: any[] = [];
        lines.forEach((line, index) => {
          searchRegex.lastIndex = 0;
          if (searchRegex.test(line)) {
            fileMatches.push({ line: index + 1, text: line });
          }
        });
        if (fileMatches.length > 0) {
          results.push({ fullPath: tab.fullPath || tab.id, name: tab.name, matches: fileMatches });
        }
      }
      setSearchResults(results);
      const totalMatches = results.reduce((acc, curr) => acc + curr.matches.length, 0);
      setGsStatus(`Готово: знайдено ${totalMatches} збігів у ${results.length} відкритих файлах.`);
    }
  }

  const updateLocalSearch = () => {
    if (!editorRef.current || !localSearch) {
      setLocalMatches([]);
      if (editorRef.current) {
        localDecorationsRef.current = editorRef.current.deltaDecorations(localDecorationsRef.current, []);
      }
      return;
    }
    const model = editorRef.current.getModel();
    if (model) {
      const matches = model.findMatches(localSearch, false, false, false, null, true);
      setLocalMatches(matches);
      setLocalMatchIdx(0);
      
      const decorations = matches.map(m => ({
        range: m.range,
        options: { className: 'local-search-highlight', inlineClassName: 'local-search-highlight' }
      }));
      localDecorationsRef.current = editorRef.current.deltaDecorations(localDecorationsRef.current, decorations);
    }
  }

  useEffect(() => {
    updateLocalSearch();
  }, [localSearch, activeTabId]);

  const findNextLocal = () => {
    if (localMatches.length > 0 && editorRef.current) {
      const nextIdx = (localMatchIdx + 1) % localMatches.length;
      setLocalMatchIdx(nextIdx);
      editorRef.current.revealLineInCenter(localMatches[nextIdx].range.startLineNumber);
      editorRef.current.setSelection(localMatches[nextIdx].range);
    }
  }

  const findPrevLocal = () => {
    if (localMatches.length > 0 && editorRef.current) {
      const prevIdx = (localMatchIdx - 1 + localMatches.length) % localMatches.length;
      setLocalMatchIdx(prevIdx);
      editorRef.current.revealLineInCenter(localMatches[prevIdx].range.startLineNumber);
      editorRef.current.setSelection(localMatches[prevIdx].range);
    }
  }

  const handleGlobalReplace = async (target: 'project' | 'open') => {
    if (target === 'project' && !activeProject?.extractDir) {
      alert('Будь ласка, розпакуйте проєкт перед глобальною заміною.');
      return;
    }
    if (!gsSearchStr) return;
    
    setGsStatus('Виконується заміна...');
    
    if (target === 'project') {
      const result = await window.api.searchAndReplace(activeProject!.extractDir!, gsSearchStr, gsReplaceStr, gsUseRegex, gsMatchCase);
      
      if (result.success) {
        setGsStatus(`Готово: замінено ${result.totalMatches} збігів у ${result.replacedFilesCount} файлах.`);
        if (result.modifiedFiles && result.modifiedFiles.length > 0) {
          setTabs(prev => prev.map(t => {
            if (t.fullPath && result.modifiedFiles.includes(t.fullPath)) {
              window.api.readLocalFile(t.fullPath).then(newContent => {
                setTabs(currentTabs => currentTabs.map(ct => ct.id === t.id ? { ...ct, content: newContent, isDirty: false } : ct));
              });
            }
            return t;
          }));
        }
      } else {
        setGsStatus(`Помилка: ${result.error}`);
      }
    } else {
      // Replace in open tabs
      let searchRegex: RegExp;
      if (gsUseRegex) {
        searchRegex = new RegExp(gsSearchStr, gsMatchCase ? 'g' : 'gi');
      } else {
        const escaped = gsSearchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escaped, gsMatchCase ? 'g' : 'gi');
      }
      let replacedFilesCount = 0;
      let totalMatches = 0;
      
      setTabs(prev => prev.map(t => {
        let matches = 0;
        const newContent = t.content.replace(searchRegex, () => {
          matches++;
          return gsReplaceStr;
        });
        if (matches > 0 && newContent !== t.content) {
          replacedFilesCount++;
          totalMatches += matches;
          return { ...t, content: newContent, isDirty: true };
        }
        return t;
      }));
      setGsStatus(`Готово: замінено ${totalMatches} збігів у ${replacedFilesCount} відкритих файлах.`);
    }
  }

  const handleSearchResultClick = async (fullPath: string, name: string, line: number) => {
    // Attempt to open the file
    const node: TreeNode = { name, path: fullPath, isFolder: false, fullPath };
    await handleFileClick(node);
    // After it opens (or is active), set cursor
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: 1 });
        editorRef.current.focus();
      }
    }, 100);
  }

  const handleContentChange = (value: string | undefined) => {
    if (value === undefined) return
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: value, isDirty: true } : t))
    setTimeout(updateLocalSearch, 50)
  }

  const closeTab = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (activeTabId === id && newTabs.length > 0) setActiveTabId(newTabs[newTabs.length - 1].id)
    else if (newTabs.length === 0) setActiveTabId('')
    setTabMenu(null)
  }

  const closeOtherTabs = (id: string) => {
    const newTabs = tabs.filter(t => t.id === id)
    setTabs(newTabs)
    setActiveTabId(id)
    setTabMenu(null)
  }

  const closeAllTabs = () => {
    setTabs([])
    setActiveTabId('')
    setTabMenu(null)
  }

  const handleTabContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setTabMenu({ id, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const handleClickOutside = () => setTabMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const renderTree = (nodes: TreeNode[], level = 0) => {
    return nodes.map(node => {
      if (searchQuery && !node.isFolder && !node.name.toLowerCase().includes(searchQuery.toLowerCase())) return null
      const paddingLeft = `${level * 14 + 10}px`
      if (node.isFolder) {
        return (
          <div key={node.path}>
            <div className="tree-item" style={{ paddingLeft }} onClick={() => setTree(toggleFolder(node.path, tree))}>
              {node.isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Folder size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            </div>
            {node.isOpen && node.children && <div style={{ marginLeft: `${level * 14 + 18}px`, borderLeft: '1px solid var(--border-color)' }}>{renderTree(node.children, 0)}</div>}
          </div>
        )
      }
      return (
        <div key={node.path} className={`tree-item ${activeTab?.id === node.path ? 'active' : ''}`} style={{ paddingLeft: level === 0 ? paddingLeft : '10px' }} onClick={() => handleFileClick(node)} title={node.name}>
          <File size={16} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        </div>
      )
    })
  }

  const percent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <>
      {promptOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)', width: '300px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-main)', fontSize: '14px' }}>Створити проєкт</h3>
            <input type="text" value={promptVal} onChange={e => setPromptVal(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-window)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', marginBottom: '16px' }} autoFocus />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn" onClick={() => setPromptOpen(false)}>Скасувати</button>
              <button className="btn" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={handleCreateProjectSubmit}>Створити</button>
            </div>
          </div>
        </div>
      )}

      {globalSearchOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setGlobalSearchOpen(false)}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '0', borderRadius: '10px', border: '1px solid var(--border-color)', width: '560px', boxShadow: '0 8px 24px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-window)', borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}>
              <div onClick={() => setGsMode('find')} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: gsMode === 'find' ? '2px solid var(--accent)' : '2px solid transparent', color: gsMode === 'find' ? 'var(--text-main)' : 'var(--text-secondary)' }}>Знайти у файлах</div>
              <div onClick={() => setGsMode('replace')} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: gsMode === 'replace' ? '2px solid var(--accent)' : '2px solid transparent', color: gsMode === 'replace' ? 'var(--text-main)' : 'var(--text-secondary)' }}>Замінити у файлах</div>
            </div>
            
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <span style={{ width: '100px', fontSize: '13px' }}>Що знайти:</span>
                <input type="text" value={gsSearchStr} onChange={e => setGsSearchStr(e.target.value)} style={{ flex: 1, padding: '6px', backgroundColor: 'var(--bg-window)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }} autoFocus />
              </div>
              
              {gsMode === 'replace' && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                  <span style={{ width: '100px', fontSize: '13px' }}>Замінити на:</span>
                  <input type="text" value={gsReplaceStr} onChange={e => setGsReplaceStr(e.target.value)} style={{ flex: 1, padding: '6px', backgroundColor: 'var(--bg-window)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '13px', backgroundColor: 'var(--bg-window)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={gsMatchCase} onChange={e => setGsMatchCase(e.target.checked)} />
                    Враховувати регістр
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={gsUseRegex} onChange={e => setGsUseRegex(e.target.checked)} />
                    Регулярний вираз
                  </label>
                </div>
              </div>

              {gsStatus && <div style={{ marginBottom: '16px', fontSize: '13px', color: gsStatus.startsWith('Помилка') ? '#ef4444' : 'var(--accent)' }}>{gsStatus}</div>}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
                {gsMode === 'find' ? (
                  <>
                    <button className="btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => handleGlobalFind('open')}>Знайти все у відкритих</button>
                    <button className="btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => handleGlobalFind('project')}>Знайти все в проєкті</button>
                  </>
                ) : (
                  <>
                    <button className="btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => handleGlobalReplace('open')}>Замінити у відкритих</button>
                    <button className="btn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => handleGlobalReplace('project')}>Замінити в проєкті</button>
                  </>
                )}
                <button className="btn" onClick={() => { setGlobalSearchOpen(false); setGsStatus(''); }}>Закрити</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="title-bar">
        <div className="title-left">
          <div className="title-dot"></div>
          <span>{lang === 'uk' ? 'Товмач' : 'Tovmach'} - {activeProject?.name || t('no.project')} {activeProject?.pakPath ? `(${activeProject.pakPath.split(/[/\\]/).pop()})` : ''}</span>
        </div>
        <div className="title-controls" style={{ position: 'relative' }}>
          <a href="https://discord.gg/ay2qXud2AF" target="_blank" className="window-btn" title="Discord" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" /></svg></a><div className="window-btn" onClick={() => setShowLangMenu(!showLangMenu)} title={t('language')}><Globe size={14} /></div>
          {showLangMenu && (
            <div style={{ position: 'absolute', top: '100%', right: '90px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', zIndex: 100, width: '120px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '4px 0' }}>
              <div onClick={() => changeLang('uk')} className="menu-item-hover" style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: lang === 'uk' ? 'var(--accent)' : 'var(--text-main)' }}>Українська</div>
              <div onClick={() => changeLang('en')} className="menu-item-hover" style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: lang === 'en' ? 'var(--accent)' : 'var(--text-main)' }}>English</div>
              <div onClick={() => changeLang('de')} className="menu-item-hover" style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: lang === 'de' ? 'var(--accent)' : 'var(--text-main)' }}>Deutsch</div>
              <div onClick={() => changeLang('fr')} className="menu-item-hover" style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: lang === 'fr' ? 'var(--accent)' : 'var(--text-main)' }}>Français</div>
            </div>
          )}
          <div className="window-btn" onClick={handleMinimize}><Minus size={16} /></div>
          <div className="window-btn" onClick={handleMaximize}><Square size={14} /></div>
          <div className="window-btn close" onClick={handleClose}><CloseIcon size={16} /></div>
        </div>
      </div>

      <div className="main-content">
        <div className="sidebar" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <button className="btn btn-icon" onClick={handleCreateProjectClick} title={t('create.project')}><Plus size={18} /></button>
            <button className="btn" style={{ flex: 1, padding: '0 8px', justifyContent: 'center' }} onClick={handleOpenPak}>
              <FolderOpen size={16} style={{ marginRight: '8px' }} />
              {t('open.pak')}
            </button>
            <button className="btn btn-icon" onClick={() => setShowProjectMenu(!showProjectMenu)} title={t('project')}><Menu size={18} /></button>
          </div>

          {showProjectMenu && (
            <div style={{ position: 'absolute', top: '45px', right: '10px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', zIndex: 10, width: '250px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              {projects.length > 0 ? projects.map(p => (
                <div key={p.id} onClick={() => handleSelectProject(p.id)} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', backgroundColor: p.id === activeProjectId ? 'var(--bg-hover)' : 'transparent', color: p.id === activeProjectId ? 'var(--accent)' : 'inherit' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <div onClick={(e) => handleDeleteProject(p.id, e)} style={{ padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="icon-hover-red" title={t('delete.project')}>
                    <Trash2 size={14} />
                  </div>
                </div>
              )) : <div style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{t('no.projects')}</div>}
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button className="btn" style={{ flex: 1, padding: '0 4px', fontSize: '13px' }} onClick={handleExtractAll} disabled={!activeProject?.pakPath}>
              <DownloadCloud size={16} style={{ marginRight: '4px' }} /> {t('extract')}
            </button>
            <button className="btn" style={{ flex: 1, padding: '0 4px', fontSize: '13px' }} onClick={handleBuildPak} disabled={!activeProject?.pakPath}>
              <UploadCloud size={16} style={{ marginRight: '4px' }} /> {t('pack')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn" style={{ flex: 1, padding: '0 4px', fontSize: '13px', backgroundColor: 'var(--accent-soft)', color: 'var(--accent-hover)' }} onClick={handleUniversalUnpack}>
              <FileText size={16} style={{ marginRight: '4px' }} /> {t('export.texts')}
            </button>
            <button className="btn" style={{ flex: 1, padding: '0 4px', fontSize: '13px', backgroundColor: 'var(--accent-soft)', color: 'var(--accent-hover)' }} onClick={handleUniversalRebuild}>
              <Save size={16} style={{ marginRight: '4px' }} /> {t('import.texts')}
            </button>
          </div>
          <div className="search-box">
            <Search size={18} color="var(--text-secondary)" />
            <input type="text" placeholder={t('search.files')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          
          <div className="tree-view" style={{ overflowX: 'hidden' }}>
            {tree.length > 0 ? renderTree(tree) : <div style={{ color: 'var(--text-secondary)', padding: '10px', fontSize: '13px', textAlign: 'center' }}>{t('no.open.files')}</div>}
          </div>
        </div>

        <div className="right-panel">
                    <div className="toolbar">
            <button className="btn" onClick={() => setGlobalSearchOpen(true)}>{t('search.replace')}</button>
            
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-window)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 8px', height: '34px', marginLeft: '4px' }}>
              <Search size={14} style={{ marginRight: '6px', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder={t('find.in.current')} 
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') findNextLocal(); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '200px', fontSize: '13px' }} 
              />
              {localSearch && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '8px' }}>{localMatches.length > 0 ? localMatchIdx + 1 : 0} {t('matches.found')} {localMatches.length}</span>}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-icon" style={{ height: '24px', minWidth: '24px', padding: 0 }} onClick={findNextLocal}>↓</button>
                <button className="btn btn-icon" style={{ height: '24px', minWidth: '24px', padding: 0 }} onClick={findPrevLocal}>↑</button>
              </div>
            </div>

            <div className="toolbar-divider" style={{ marginLeft: '12px' }}></div>
            <button className="btn btn-icon" onClick={() => editorRef.current?.trigger('keyboard', 'undo', null)}><Undo2 size={20} /></button>
            <button className="btn btn-icon" onClick={() => editorRef.current?.trigger('keyboard', 'redo', null)}><Redo2 size={20} /></button>

            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button className="btn btn-icon" onClick={() => setShowViewMenu(!showViewMenu)} title={t('view.options')}><FileText size={20} /></button>
              {showViewMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowViewMenu(false)} />
                  <div style={{ position: 'absolute', top: '100%', right: '0', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', zIndex: 100, width: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={viewOptions.whitespace} onChange={e => setViewOptions(prev => ({...prev, whitespace: e.target.checked}))} />
                      {t('view.whitespace')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={viewOptions.lineEndings} onChange={e => setViewOptions(prev => ({...prev, lineEndings: e.target.checked}))} />
                      {t('view.lineendings')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={viewOptions.nonPrintable} onChange={e => setViewOptions(prev => ({...prev, nonPrintable: e.target.checked}))} />
                      {t('view.nonprintable')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={viewOptions.controlChars} onChange={e => setViewOptions(prev => ({...prev, controlChars: e.target.checked}))} />
                      {t('view.controlchars')}
                    </label>
                  </div>
                </>
              )}
            </div>

            <button className="btn" style={{ marginLeft: '8px', backgroundColor: activeTab && activeTab.isDiff ? 'var(--accent)' : 'transparent', color: activeTab && activeTab.isDiff ? 'white' : 'var(--text)' }} onClick={activeTab && activeTab.isDiff ? () => setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, isDiff: false } : t)) : handleSmartCompare}>Smart Compare</button>
            <button className="btn" onClick={handleSave} disabled={!activeTab || !activeTab.isDirty || activeTab.isDiff}>{t('save')}</button>
          </div>

          <div className={`editor-container ${showSeparators ? 'show-separators' : 'hide-separators'}`} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            {progress.active && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                <div style={{ width: '256px', height: '8px', backgroundColor: '#1f2937', borderRadius: '9999px', overflow: 'hidden', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.1s ease-out', width: `${percent}%` }} />
                </div>
                <div style={{ color: '#d1d5db', fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>
                  {progress.type === 'extract' ? 'Розпакування...' : 'Запакування...'} {progress.current} / {progress.total}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{progress.fileName}</div>
              </div>
            )}

            <div className="tabs-header" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-window)', overflowX: 'auto' }}>
              {tabs.map(tab => (
                <div key={tab.id} onClick={() => setActiveTabId(tab.id)} onContextMenu={(e) => handleTabContextMenu(e, tab.id)} style={{ height: '34px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: activeTabId === tab.id ? 'var(--bg-panel)' : 'transparent', borderRight: '1px solid var(--border-color)', borderTop: activeTabId === tab.id ? '2px solid var(--accent)' : '2px solid transparent', color: activeTabId === tab.id ? 'var(--text-main)' : 'var(--text-secondary)', fontSize: '13px', minWidth: '120px', maxWidth: '200px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tab.isDirty ? 'var(--accent)' : 'inherit', flex: 1 }}>{tab.name} {tab.isDirty && '*'}</span>
                  <div onClick={(e) => closeTab(tab.id, e)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '3px', opacity: 0.7 }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}><CloseIcon size={12} /></div>
                </div>
              ))}
            </div>

            {tabMenu && (
              <div style={{ position: 'fixed', left: tabMenu.x, top: tabMenu.y, backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', zIndex: 100, width: '150px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '4px 0' }}>
                <div onClick={(e) => { e.stopPropagation(); closeTab(tabMenu.id); }} style={{ padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-main)' }} className="menu-item-hover">Закрити</div>
                <div onClick={(e) => { e.stopPropagation(); closeOtherTabs(tabMenu.id); }} style={{ padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-main)' }} className="menu-item-hover">Закрити інші</div>
                <div onClick={(e) => { e.stopPropagation(); closeAllTabs(); }} style={{ padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-main)' }} className="menu-item-hover">Закрити всі</div>
              </div>
            )}

            <div style={{ flex: 1, paddingTop: '8px', overflow: 'hidden' }}>
              {activeTab ? (
                  (
                    activeTab.isDiff ? (
                      <DiffEditor key={"diff-" + activeTab.id} height="100%" language="xml" original={activeTab.originalContent} modified={activeTab.content} beforeMount={defineTheme} onMount={(editor, monacoInst) => {
                          editor.getModifiedEditor().onDidChangeModelContent(() => handleContentChange(editor.getModifiedEditor().getValue()));
                        }} theme="custom-dark" options={{ minimap: { enabled: false }, wordWrap: 'off', renderWhitespace: 'all', fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 14, readOnly: false, originalEditable: false, insertSpaces: false, detectIndentation: false, tabSize: 2, unicodeHighlight: { invisibleCharacters: false, ambiguousCharacters: false, nonBasicASCII: false } }} />
                    ) : (
                      <Editor key={activeTab.id} height="100%" language="xml" theme="custom-dark" value={activeTab.content} onChange={handleContentChange} beforeMount={defineTheme} onMount={handleEditorDidMount} options={{ minimap: { enabled: false }, wordWrap: 'off', renderWhitespace: viewOptions.whitespace ? 'all' : 'selection', bracketPairColorization: { enabled: true }, fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 14, lineNumbersMinChars: 4, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: 'smooth', renderControlCharacters: (viewOptions.nonPrintable || viewOptions.controlChars), unusualLineTerminators: 'off', insertSpaces: false, detectIndentation: false, tabSize: 2, unicodeHighlight: { invisibleCharacters: false, ambiguousCharacters: false, nonBasicASCII: false } }} />
                    )
                  )
              ) : <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>{t('no.open.files')}</div>}
            </div>

            {searchResults && (
              <div style={{ height: '35%', minHeight: '150px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-window)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', fontSize: '12px' }}>
                  <span>Результати пошуку: знайдено {searchResults.reduce((a,c) => a+c.matches.length, 0)} збігів у {searchResults.length} файлах</span>
                  <div style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setSearchResults(null)} onMouseOver={(e) => e.currentTarget.style.opacity = '1'} onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}><CloseIcon size={14} /></div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', fontSize: '13px', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {(() => {
                    let totalRendered = 0;
                    const maxToRender = 300;
                    const rendered = [];
                    for (let idx = 0; idx < searchResults.length; idx++) {
                      if (totalRendered >= maxToRender) {
                        rendered.push(<div key="more" style={{ color: 'var(--text-secondary)', padding: '8px' }}>Показано перші {maxToRender} збігів. Уточніть пошук, щоб побачити більше.</div>);
                        break;
                      }
                      const fileRes = searchResults[idx];
                      const fileMatches = fileRes.matches.slice(0, maxToRender - totalRendered);
                      totalRendered += fileMatches.length;
                      
                      rendered.push(
                        <div key={idx} style={{ marginBottom: '8px' }}>
                          <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '2px', cursor: 'pointer' }} onClick={() => handleFileClick({ name: fileRes.name, path: fileRes.fullPath, isFolder: false, fullPath: fileRes.fullPath })}>
                            {fileRes.fullPath} ({fileRes.matches.length} збігів)
                          </div>
                          {fileMatches.map((m, midx) => (
                            <div key={midx} style={{ display: 'flex', gap: '8px', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }} className="menu-item-hover" onClick={() => handleSearchResultClick(fileRes.fullPath, fileRes.name, m.line)}>
                              <span style={{ color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'right', userSelect: 'none' }}>Ряд {m.line}:</span>
                              <span>{m.text.trim()}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return rendered;
                  })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="status-bar">
        <div>{progress.active ? `Прогрес: ${Math.round(percent)}%` : activeTab ? `Готово` : 'Очікування'}</div>
        <div style={{ display: 'flex', gap: '16px' }}>
                                  {activeTab && (
              <span>
                {t('length')}: {editorStats.totalLength} {t('lines')}: {editorStats.totalLines}{' | '}
                {t('line')}: {editorStats.line} {t('col')}: {editorStats.column}
                {editorStats.selLength > 0 ? ` ${t('selected')}: ${editorStats.selLength}` : ''}
              </span>
            )}
          {activeTab && <span>{activeTab.source === 'local' ? 'Local File' : 'Pak Entry'}</span>}
          <div>{t('selected')} <span className="status-highlight" title={activeTab?.id}>{activeTab ? activeTab.name : t('nothing')}</span></div>
        </div>
      </div>
    </>
  )
}
export default App













































