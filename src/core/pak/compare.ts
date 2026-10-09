

export function smartAlignXml(sourceXml, refXml) {
  // Regex to extract all <string> blocks
  const stringRegex = /<string>[\s\S]*?<\/string>/gi;
  
  const refBlocksByName = new Map();
  const refBlocksById = new Map();
  
  let match;
  while ((match = stringRegex.exec(refXml)) !== null) {
    const block = match[0];
    const idMatch = block.match(/<id>([^<]+)<\/id>/i);
    const nameMatch = block.match(/<name>([^<]+)<\/name>/i);
    
    if (nameMatch) {
      refBlocksByName.set(nameMatch[1], { block, id: idMatch ? idMatch[1] : null });
    }
    if (idMatch) {
      refBlocksById.set(idMatch[1], { block, name: nameMatch ? nameMatch[1] : null });
    }
  }

  // If the file does not have <string><id> format, just return the raw refXml
  if (refBlocksById.size === 0) {
    return refXml;
  }

  const usedRefBlocks = new Set();
  
  // Now replace the source <string> blocks with the matched reference blocks
  // to perfectly align the structure.
  const alignedRefXml = sourceXml.replace(stringRegex, (sourceBlock) => {
    const idMatch = sourceBlock.match(/<id>([^<]+)<\/id>/i);
    const nameMatch = sourceBlock.match(/<name>([^<]+)<\/name>/i);
    
    const sId = idMatch ? idMatch[1] : null;
    const sName = nameMatch ? nameMatch[1] : null;
    
    let matchedRef = null;
    let warning = '';
    
    if (sName && refBlocksByName.has(sName)) {
      matchedRef = refBlocksByName.get(sName);
      if (matchedRef.id !== sId) {
        warning = `<!-- УВАГА: В старій версії цей <name> мав <id>${matchedRef.id}</id> -->\n`;
      }
    } else if (sId && refBlocksById.has(sId)) {
      matchedRef = refBlocksById.get(sId);
      // It matched by ID but not by name
      if (sName && matchedRef.name !== sName) {
        warning = `<!-- УВАГА: В старій версії цей <id> мав <name>${matchedRef.name}</name> -->\n`;
      }
    }
    
    if (matchedRef && !usedRefBlocks.has(matchedRef.block)) {
      usedRefBlocks.add(matchedRef.block);
      // Replace the ID in the reference block to match the source ID so that Monaco Diff doesn't highlight it?
      // No! The user WANTS to see the ID change!
      // But we inject the warning above the block.
      // Actually, if we just return the block, Monaco Diff will align it against the source block.
      // Wait, Monaco Diff aligns by text similarity. If the block has a different ID, it might still align the bodies.
      // To ensure perfect block-by-block alignment, we just return it here.
      return warning + matchedRef.block;
    }
    
    // If not found in reference, return an empty string or placeholder so Diff shows it as added in Source
    return '';
  });
  
  // Clean up multiple blank lines that might result from replacing blocks with empty strings
  // Actually, returning an empty string will make Monaco Diff show the whole block as green (Added).
  return alignedRefXml;
}


