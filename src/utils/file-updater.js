// lib/file-updater.js

import fs from 'fs';
import path from 'path';
import util from 'util';
import {logVerbose} from './logger.js';
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);


/**
 * Update all files with generated docstrings
 */
async function updateFilesWithDocStrings(componentsByFile, docStrings, projectDir, options) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    filesProcessed: 0,
    filesModified: 0
  };
  
  // Process each file that contains components
  for (const [filePath, components] of Object.entries(componentsByFile)) {
    console.log(`Updating file ${results.filesProcessed + 1}/${Object.keys(componentsByFile).length}: ${path.relative(projectDir, filePath)}`);
    
    // Count skipped components
    const skippedComponents = components.filter(c => {
      const docStringResult = docStrings[c.uniqueId];
      return docStringResult && docStringResult.skipped;
    }).length;
    
    results.skipped += skippedComponents;
    
    // Update the file with docstrings
    const fileResult = await updateFileWithDocStrings(filePath, components, docStrings, options);
    
    // Update overall results
    results.success += fileResult.success;
    results.failed += fileResult.failed;
    results.filesProcessed++;
    
    if (fileResult.modified) {
      results.filesModified++;
    }
  }
  
  return results;
}


/**
 * Calculate new position after insertion or replacement
 * @param {number} originalPos - Original position in the file
 * @param {number} modificationPos - Position where modification was made
 * @param {number} oldLength - Length of content that was replaced (0 for insertion)
 * @param {number} newLength - Length of new content that was inserted
 * @returns {number} New position after modification
 */
function adjustPosition(originalPos, modificationPos, oldLength, newLength) {
  // If original position is before modification, no change needed
  if (originalPos <= modificationPos) {
    return originalPos;
  }
  
  // If position is after the modification, adjust by the difference in length
  return originalPos - oldLength + newLength;
}
/**
 * Update a file with documentation for all its components
 */
async function updateFileWithDocStrings(filePath, components, docStrings, options) {
  if (options.isDryRun) {
    logVerbose(`[Dry run] Would update file: ${filePath}`);
    return { success: components.length, failed: 0, modified: false };
  }
  
  try {
    // Read the file content
    let content = await readFile(filePath, 'utf8');
    const originalContent = content;
    
    // Sort components by their position in descending order
    // This allows us to modify the file from bottom to top
    const sortedComponents = [...components].sort((a, b) => b.startPos - a.startPos);
    
    let modified = false;
    let success = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const component of sortedComponents) {
      const docStringResult = docStrings[component.uniqueId];
      
      // Skip if no docstring generated or marked as skipped
      if (!docStringResult || !docStringResult.docstring || docStringResult.skipped) {
        logVerbose(`Skipping component ${component.name} in ${filePath}`);
        skipped++;
        continue;
      }
      
      try {
        // Get the original position from the unmodified content
        const originalPosition = findComponentPosition(originalContent, component);
        
        // Find the corresponding position in the current content
        const currentPosition = findComponentPosition(content, component);
        
        if (!currentPosition) {
          console.error(`Could not locate component ${component.name} in file`);
          failed++;
          continue;
        }
        
        // Check for existing docstring
        const existingDoc = findExistingDocString(content, currentPosition.start);
        
        if (existingDoc) {
          if (options.updateExisting) {
            // Replace existing docstring
            content = content.substring(0, existingDoc.start) +
                      docStringResult.docstring +
                      content.substring(existingDoc.end);
            
            logVerbose(`Updated existing documentation for ${component.name}`);
            modified = true;
            success++;
          } else {
            logVerbose(`Skipping ${component.name} - already has documentation`);
            skipped++;
          }
        } else {
          // Find proper insertion point (beginning of line where component starts)
          const beforeComponent = content.substring(0, currentPosition.start);
          const lastNewline = beforeComponent.lastIndexOf('\n');
          const insertPos = lastNewline === -1 ? 0 : lastNewline + 1;
          
          // Add docstring at insert position
          content = content.substring(0, insertPos) +
                    docStringResult.docstring + '\n' +
                    content.substring(insertPos);
          
          logVerbose(`Added documentation for ${component.name}`);
          modified = true;
          success++;
        }
      } catch (err) {
        console.error(`Error adding documentation to ${component.name}: ${err.message}`);
        failed++;
      }
    }
    
    // Only write the file if modifications were made
    if (modified) {
      await writeFile(filePath, content, 'utf8');
      logVerbose(`Updated file: ${filePath}`);
    }
    
    return { success, failed, skipped, modified };
  } catch (error) {
    console.error(`Error updating file ${filePath}: ${error.message}`);
    return { success: 0, failed: components.length, skipped: 0, modified: false };
  }
}

/**
 * Find the current position of a component in content
 */
function findComponentPosition(content, component) {
  const componentSignature = getComponentSignature(component);
  
  // Try to find the component by its signature
  const signatureIndex = content.indexOf(componentSignature);
  
  if (signatureIndex === -1) {
    return null;
  }
  
  // Look for the start of the line containing the component
  const beforeSignature = content.substring(0, signatureIndex);
  const lastNewline = beforeSignature.lastIndexOf('\n');
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
  
  // Check for export keyword
  let exportStart = lineStart;
  const lineContent = content.substring(lineStart, signatureIndex);
  
  if (lineContent.trim().startsWith('export')) {
    exportStart = lineStart;
  }
  
  return {
    start: exportStart,
    signatureStart: signatureIndex,
    signatureEnd: signatureIndex + componentSignature.length
  };
}

/**
 * Get a unique signature to identify a component
 */
function getComponentSignature(component) {
  // Get first line of component code
  const firstLine = component.code.split('\n')[0].trim();
  return firstLine;
}

/**
 * Find existing docstring before a position
 */
function findExistingDocString(content, position) {
  // Get content before component
  const before = content.substring(0, position).trim();
  
  // Check if there's a JSDoc comment ending right before
  if (!before.endsWith('*/')) {
    return null;
  }
  
  // Find the start of this docstring
  const docEnd = before.lastIndexOf('*/');
  const docStart = before.lastIndexOf('/**', docEnd);
  
  if (docStart === -1) {
    return null;
  }
  
  return {
    start: docStart,
    end: docEnd + 2,
    content: before.substring(docStart, docEnd + 2)
  };
}

export {
  updateFilesWithDocStrings,
  updateFileWithDocStrings,
  adjustPosition
};
