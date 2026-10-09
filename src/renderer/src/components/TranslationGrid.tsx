import React, { useState, useEffect, useMemo } from 'react';
import { Save, Copy, ClipboardPaste, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface Entry {
    file: string;
    id?: string;
    seq?: number;
    tag: string;
    text: string;
    globalIndex: number;
}

export default function TranslationGrid({ activeProject, txtPath, mapPath }: { activeProject: any, txtPath: string, mapPath: string }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [saving, setSaving] = useState(false);
    const [showMassModal, setShowMassModal] = useState(false);
    const [massInput, setMassInput] = useState('');
    const pageSize = 500;

    useEffect(() => {
        loadData();
    }, [txtPath]);

    const loadData = async () => {
        setLoading(true);
        try {
            const txtBuf = await window.electron.ipcRenderer.invoke('local:readFile', txtPath);
            const mapBuf = await window.electron.ipcRenderer.invoke('local:readFile', mapPath);
            if (!txtBuf || !mapBuf) {
                setLoading(false);
                return;
            }

            const txtContent = txtBuf;
            const mapContent = mapBuf;
            
            const mapData = JSON.parse(mapContent);
            const textLines = txtContent.split('\n');
            
            const fileTexts: Record<string, string[]> = {};
            let currentFile: string | null = null;
            
            for (const line of textLines) {
                if (line.startsWith('# --- FILE: ')) {
                     currentFile = line.substring(12, line.length - 4).trim();
                     fileTexts[currentFile] = [];
                } else if (currentFile) {
                     if (line === '' && fileTexts[currentFile].length >= (mapData[currentFile]?.length || 0)) continue;
                     if (fileTexts[currentFile].length < (mapData[currentFile]?.length || 0)) {
                         fileTexts[currentFile].push(line.replace(/<--\|-->/g, '\n'));
                     }
                }
            }

            const flat: Entry[] = [];
            let globalIdx = 0;
            for (const file of Object.keys(mapData)) {
                const maps = mapData[file];
                const texts = fileTexts[file] || [];
                for (let i = 0; i < maps.length; i++) {
                    flat.push({
                        file,
                        id: maps[i].id,
                        seq: maps[i].seq,
                        tag: maps[i].tag,
                        text: texts[i] !== undefined ? texts[i] : '',
                        globalIndex: globalIdx++
                    });
                }
            }
            setEntries(flat);
        } catch (e) {
            console.error('Failed to load grid', e);
        }
        setLoading(false);
    };

    const handleTextChange = (globalIndex: number, newText: string) => {
        setEntries(prev => {
            const copy = [...prev];
            copy[globalIndex] = { ...copy[globalIndex], text: newText };
            return copy;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let outContent = '';
            let currentFile = '';
            for (const e of entries) {
                if (e.file !== currentFile) {
                    if (currentFile !== '') outContent += '\n';
                    outContent += `# --- FILE: ${e.file} ---\n`;
                    currentFile = e.file;
                }
                outContent += e.text.replace(/\r/g, '').replace(/\n/g, '<--|-->') + '\n';
            }
            outContent += '\n';
            
            await window.electron.ipcRenderer.invoke('local:writeFile', txtPath, outContent);
        } catch(e) {
            console.error(e);
            alert('Помилка збереження');
        }
        setSaving(false);
    };

    const totalPages = Math.ceil(entries.length / pageSize);
    const currentPageEntries = useMemo(() => {
        return entries.slice(page * pageSize, (page + 1) * pageSize);
    }, [entries, page]);

    const handleMassTranslateOpen = () => {
        setMassInput('');
        setShowMassModal(true);
    };

    const handleMassTranslateApply = () => {
        const lines = massInput.split('\n');
        if (lines.length > currentPageEntries.length && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        
        if (lines.length !== currentPageEntries.length) {
            if (!confirm(`Увага! Кількість рядків не збігається. \nОчікувалось: ${currentPageEntries.length}\nВставлено: ${lines.length}\nПродовжити?`)) {
                return;
            }
        }

        setEntries(prev => {
            const copy = [...prev];
            for (let i = 0; i < Math.min(lines.length, currentPageEntries.length); i++) {
                const globalIdx = page * pageSize + i;
                copy[globalIdx] = { ...copy[globalIdx], text: lines[i].replace(/<--\|-->/g, '\n') };
            }
            return copy;
        });
        setShowMassModal(false);
    };

    const getMassCopyText = () => {
        return currentPageEntries.map(e => e.text.replace(/\r/g, '').replace(/\n/g, '<--|-->')).join('\n');
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getMassCopyText());
    };

    if (loading) return <div style={{ padding: 20 }}>Завантаження таблиці...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-main)' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', gap: '10px' }}>
                <button className="btn" onClick={handleSave} disabled={saving}>
                    <Save size={16} style={{ marginRight: 6 }} /> {saving ? 'Збереження...' : 'Зберегти'}
                </button>
                <div style={{ flex: 1 }} />
                
                <button className="btn" onClick={handleMassTranslateOpen} style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
                    <ClipboardPaste size={16} style={{ marginRight: 6 }} /> Масовий Переклад
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
                    <button className="btn btn-icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18} /></button>
                    <span>Сторінка {page + 1} з {totalPages || 1}</span>
                    <button className="btn btn-icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={18} /></button>
                </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '8px', width: '250px' }}>Файл</th>
                            <th style={{ padding: '8px', width: '120px' }}>ID (SUB)</th>
                            <th style={{ padding: '8px', width: '50px' }}>№</th>
                            <th style={{ padding: '8px' }}>Текст</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentPageEntries.map((entry, idx) => {
                            const isNewFile = idx === 0 || currentPageEntries[idx - 1].file !== entry.file;
                            return (
                                <tr key={entry.globalIndex} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px', verticalAlign: 'top', color: 'var(--text-secondary)', fontSize: '12px', borderRight: '1px solid var(--border-color)' }}>
                                        {isNewFile ? entry.file : ''}
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top', borderRight: '1px solid var(--border-color)' }}>
                                        <div style={{ fontWeight: 'bold' }}>{entry.id !== undefined ? entry.id : `seq: ${entry.seq}`}</div>
                                        <div style={{ color: 'var(--accent)', fontSize: '12px' }}>&lt;{entry.tag}&gt;</div>
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top', borderRight: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        {page * pageSize + idx + 1}
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                                        <textarea 
                                            value={entry.text}
                                            onChange={(e) => handleTextChange(entry.globalIndex, e.target.value)}
                                            style={{ 
                                                width: '100%', 
                                                minHeight: '40px',
                                                backgroundColor: 'rgba(0,0,0,0.2)', 
                                                border: '1px solid transparent',
                                                color: 'inherit',
                                                fontFamily: 'inherit',
                                                resize: 'vertical',
                                                padding: '4px',
                                                outline: 'none',
                                                borderRadius: '4px'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                                            onBlur={(e) => e.target.style.borderColor = 'transparent'}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {showMassModal && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ backgroundColor: 'var(--bg-panel)', width: '90%', height: '90%', borderRadius: '10px', display: 'flex', flexDirection: 'column', padding: '20px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0 }}>Масовий Переклад (Сторінка {page + 1})</h2>
                            <button className="btn" onClick={() => setShowMassModal(false)}>Закрити</button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>Оригінал ({currentPageEntries.length} рядків)</span>
                                    <button className="btn" onClick={copyToClipboard}><Copy size={14} style={{marginRight: 4}}/> Копіювати все</button>
                                </div>
                                <textarea 
                                    readOnly 
                                    value={getMassCopyText()} 
                                    style={{ flex: 1, backgroundColor: '#000', color: '#ccc', padding: '10px', fontFamily: 'monospace', resize: 'none', borderRadius: '6px', border: '1px solid var(--border-color)' }} 
                                />
                            </div>
                            
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>Переклад (вставте сюди)</span>
                                </div>
                                <textarea 
                                    value={massInput}
                                    onChange={(e) => setMassInput(e.target.value)}
                                    placeholder="Вставте перекладені рядки з DeepL сюди..."
                                    style={{ flex: 1, backgroundColor: '#111', color: '#fff', padding: '10px', fontFamily: 'monospace', resize: 'none', borderRadius: '6px', border: '1px solid var(--accent)', outline: 'none' }} 
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={handleMassTranslateApply} style={{ backgroundColor: 'var(--accent)', color: 'white', fontSize: '16px', padding: '10px 20px' }}>
                                <Check size={18} style={{ marginRight: 8 }} /> Застосувати переклад
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}