import * as fs from 'fs'
import * as path from 'path'

const DIALOG_TAGS = [
    'Act', 'QuestId', 'QuestName', 'QuestType', '__review__', 'airline_service',
    'b', 'change_item_skin', 'charge_item', 'charge_item_ap', 'charge_item_auto',
    'charge_item_auto_ap', 'combine_skill_levelup', 'combine_task', 'compound_weapon',
    'create_pcguild', 'decompound_weapon', 'delete_pcguild', 'deposit_char_warehouse',
    'display_type', 'edit_char_all', 'edit_char_gender', 'enter_pvp', 'exchange_coin',
    'extend_inventory', 'faction_join', 'faction_separate', 'font', 'gather_skill_levelup',
    'give_item_proc', 'giveup_craft_expert', 'giveup_craft_master', 'guild_change_emblem',
    'guild_levelup', 'housing_change_building', 'housing_config', 'housing_guestbook',
    'housing_kick', 'housing_like', 'housing_pay_rent', 'housing_personal_auction',
    'housing_recreate_personal_ins', 'housing_script', 'instance_entry', 'item_upgrade',
    'leave_pvp', 'match_maker', 'ment', 'message_type', 'name', 'notify',
    'open_guild_warehouse', 'open_vendor', 'p', 'pet_abandon', 'pet_adopt',
    'pet_h_abandon', 'pet_h_adopt', 'recreate_pcguild', 'remove_item_option',
    'restore_xp', 'stigma_enchant', 'stigma_open', 'teleport_ins_housing',
    'town_challenge', 'trade_buy', 'trade_in', 'trade_in_upgrade', 'trade_sell',
    'trade_sell_list', 'Text'
]
const DIALOG_PATTERN = DIALOG_TAGS.join('|')
const DIALOG_REGEX = new RegExp(`<(${DIALOG_PATTERN})(?:\\s+[^>]*?(?<!\\/))?>([\\s\\S]*?)<\\/\\1>`, 'gi')

async function walkDir(dir: string, callback: (filePath: string) => Promise<void>) {
  const files = fs.readdirSync(dir)
  for (const f of files) {
    const fullPath = path.join(dir, f)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) await walkDir(fullPath, callback)
    else await callback(fullPath)
  }
}

function readFileSafely(filePath: string): string {
    const buf = fs.readFileSync(filePath)
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
        return buf.toString('utf16le').replace(/^\uFEFF/, '')
    }
    let nullCount = 0;
    for(let i=1; i<Math.min(buf.length, 100); i+=2) if (buf[i]===0) nullCount++;
    if (nullCount > 10) return buf.toString('utf16le')
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return buf.toString('utf8').replace(/^\uFEFF/, '')
    }
    return buf.toString('utf8')
}

function getAllFilesSync(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir)
  for (const f of files) {
    const fullPath = path.join(dir, f)
    if (fs.statSync(fullPath).isDirectory()) getAllFilesSync(fullPath, fileList)
    else fileList.push(fullPath)
  }
  return fileList
}

export async function extractAllStrings(projectDir: string, outBasePath: string, onProgress: (current: number, total: number, msg: string) => void) {
  const textStream = fs.createWriteStream(outBasePath + '.txt', { encoding: 'utf-8' })
  const mapData: Record<string, any[]> = {}

  let count = 0
  const allFiles = getAllFilesSync(projectDir).filter(f => f.toLowerCase().endsWith('.xml') || f.toLowerCase().endsWith('.html'))
  const total = allFiles.length

  for (const filePath of allFiles) {
    const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/')
    
    count++
    if (count % 100 === 0) {
        onProgress(count, total, `Сканування: ${count}/${total} файлів...`)
        await new Promise(r => setTimeout(r, 0))
    }

    let content = readFileSafely(filePath)
    let lowerContent = content.toLowerCase();
    
    let isStringTable = false;
    let pos = 0;
    let entries: any[] = [];
    
    while (true) {
        let start = lowerContent.indexOf('<string>', pos);
        if (start === -1) break;
        let end = lowerContent.indexOf('</string>', start);
        if (end === -1) break;
        
        isStringTable = true;
        let block = content.substring(start, end + 9);
        pos = end + 9;
        
        let idMatch = block.match(/<id>\s*([^<]+)\s*<\/id>/i);
        if (idMatch) {
            let id = idMatch[1].trim();
            
            let bodyMatch = block.match(/<body(?:[^>]*?(?<!\/))?>([\s\S]*?)<\/body>/i);
            if (bodyMatch && bodyMatch[1].trim()) {
                entries.push({ id, tag: 'body', text: bodyMatch[1] })
            }
        }
    }

    if (!isStringTable) {
        let seq = 0;
        let match;
        DIALOG_REGEX.lastIndex = 0;
        while ((match = DIALOG_REGEX.exec(content)) !== null) {
            let tag = match[1];
            let text = match[2];
            if (text.trim()) {
                entries.push({ seq, tag, text })
            }
            seq++;
        }
    }
    
    if (entries.length > 0) {
        textStream.write(`# --- FILE: ${relPath} ---\n`)
        mapData[relPath] = []
        for (const e of entries) {
            let cleanText = e.text.replace(/\r/g, '')
            textStream.write(cleanText + '<--|-->\n')
            if (e.id) mapData[relPath].push({ id: e.id, tag: e.tag })
            else mapData[relPath].push({ seq: e.seq, tag: e.tag })
        }
        textStream.write('\n')
    }
  }
  
  await new Promise<void>((resolve, reject) => {
      textStream.on('finish', resolve)
      textStream.on('error', reject)
      textStream.end()
  })
  
  fs.writeFileSync(outBasePath + '.map.json', JSON.stringify(mapData, null, 2), 'utf-8')
  onProgress(total, total, 'Готово! Файл збережено.')
}

export async function rebuildAllStrings(projectDir: string, basePath: string, onProgress: (current: number, total: number, msg: string) => void) {
  const dictPath = basePath + '.txt'
  const mapPath = basePath + '.map.json'
  if (!fs.existsSync(dictPath) || !fs.existsSync(mapPath)) throw new Error('Dictionary or map file not found.')
  
  onProgress(0, 100, 'Читання файлів...')
  const dictContent = fs.readFileSync(dictPath, 'utf-8').replace(/\r/g, '')
  const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf-8'))
  
  const filesTexts: Record<string, string[]> = {}
  
  const fileBlocks = dictContent.split('# --- FILE: ')
  for (const block of fileBlocks) {
      if (!block.trim()) continue;
      
      const firstNewline = block.indexOf('\n');
      if (firstNewline === -1) continue;
      
      const fileName = block.substring(0, firstNewline).replace('---', '').trim();
      const textContent = block.substring(firstNewline + 1).trimStart();
      
      const entriesText = textContent.split('<--|-->');
      const cleanEntries: string[] = [];
      for (let i = 0; i < entriesText.length; i++) {
          let t = entriesText[i];
          if (t.startsWith('\n')) t = t.substring(1);
          if (i === entriesText.length - 1 && t.trim() === '') continue; 
          cleanEntries.push(t);
      }
      filesTexts[fileName] = cleanEntries;
  }
  
  let processedFiles = 0
  const fileKeys = Object.keys(mapData)
  
  const total = fileKeys.length
  
  for (const fileRelPath of fileKeys) {
      processedFiles++
      if (processedFiles % 100 === 0) {
          onProgress(processedFiles, total, `Оновлено: ${processedFiles}/${total} файлів...`)
          await new Promise(r => setTimeout(r, 0))
      }
      
      const fullPath = path.join(projectDir, fileRelPath)
      if (!fs.existsSync(fullPath)) continue
      
      const mapEntries = mapData[fileRelPath]
      const texts = filesTexts[fileRelPath] || []
      
      const entries = mapEntries.map((e: any, i: number) => ({ ...e, text: texts[i] !== undefined ? texts[i] : '' }))
      
      const buf = fs.readFileSync(fullPath)
      const hasBom16 = buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE
      const hasBom8 = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
      let nullCount = 0;
      for(let i=1; i<Math.min(buf.length, 100); i+=2) if (buf[i]===0) nullCount++;
      const isUtf16Le = hasBom16 || nullCount > 10;
      
      let content = isUtf16Le ? buf.toString('utf16le').replace(/^\uFEFF/, '') 
                  : hasBom8 ? buf.toString('utf8').replace(/^\uFEFF/, '') 
                  : buf.toString('utf8')
                  
      const isStringTable = entries.some(e => e.id !== undefined)
      let lowerContent = content.toLowerCase();
      
      if (isStringTable) {
          let pos = 0;
          let newContent = "";
          
          while (true) {
              let start = lowerContent.indexOf('<string>', pos);
              if (start === -1) break;
              let end = lowerContent.indexOf('</string>', start);
              if (end === -1) break;
              
              newContent += content.substring(pos, start);
              let block = content.substring(start, end + 9);
              pos = end + 9;
              
              let idMatch = block.match(/<id>\s*([^<]+)\s*<\/id>/i);
              if (idMatch) {
                  let id = idMatch[1].trim();
                  let blockEntries = entries.filter(e => e.id === id);
                  for (const e of blockEntries) {
                      let tagRegex = new RegExp(`(<${e.tag}(?:[^>]*?(?<!\\/))?>)([\\s\\S]*?)(<\\/${e.tag}>)`, 'i');
                      block = block.replace(tagRegex, `$1${e.text}$3`);
                  }
              }
              newContent += block;
          }
          newContent += content.substring(pos);
          content = newContent;
      } else {
          let pos = 0;
          let newContent = "";
          let seq = 0;
          
          DIALOG_REGEX.lastIndex = 0;
          let tagMatch;
          while ((tagMatch = DIALOG_REGEX.exec(content)) !== null) {
              newContent += content.substring(pos, tagMatch.index);
              
              let tag = tagMatch[1];
              let entry = entries.find(e => e.seq === seq && e.tag === tag);
              
              if (entry) {
                  let fullMatch = tagMatch[0];
                  let innerStart = fullMatch.indexOf('>') + 1;
                  let innerEnd = fullMatch.lastIndexOf('</');
                  let replaced = fullMatch.substring(0, innerStart) + entry.text + fullMatch.substring(innerEnd);
                  newContent += replaced;
              } else {
                  newContent += tagMatch[0];
              }
              
              pos = DIALOG_REGEX.lastIndex;
              seq++;
          }
          newContent += content.substring(pos);
          content = newContent;
      }
      
      let outBuf: Buffer;
      if (isUtf16Le) {
          const textBuf = Buffer.from(content, 'utf16le')
          outBuf = hasBom16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), textBuf]) : textBuf
      } else {
          const textBuf = Buffer.from(content, 'utf8')
          outBuf = hasBom8 ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), textBuf]) : textBuf
      }
      fs.writeFileSync(fullPath, outBuf)
  }
  
  onProgress(total, total, 'Готово! Файли оновлено.')
}