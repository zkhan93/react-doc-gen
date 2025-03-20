// lib/extractor.js

import fs from 'fs';
import path from 'path';
import babylon from '@babel/parser';
import _traverse from "@babel/traverse";
const traverse = _traverse.default;
import t from '@babel/types';
import { minimatch } from 'minimatch'

import { logVerbose } from './utils/logger.js';

const readFile = fs.promises.readFile;



/**
 * Load .gitignore patterns from a project directory
 */
async function loadGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  const ignorePatterns = [];
  console.log(`Loading .gitignore from ${gitignorePath}`);
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = await readFile(gitignorePath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }
        ignorePatterns.push(trimmedLine);
      }
      logVerbose(`Loaded ${ignorePatterns.length} ignore patterns from .gitignore`);
    } else {
      logVerbose('No .gitignore file found');
    }
  } catch (error) {
    console.error(`Error loading .gitignore: ${error.message}`);
  }
  
  return ignorePatterns;
}

/**
 * Check if a file should be ignored based on .gitignore patterns
 */
function isIgnored(filePath, ignorePatterns, baseDir) {
  const relativePath = path.relative(baseDir, filePath);
  logVerbose(`Checking ignore for ${relativePath}`);
  
  // Track whether the file should be ignored
  let shouldIgnore = false;
  
  for (const pattern of ignorePatterns) {
    // Handle negated patterns (those starting with !)
    if (pattern.startsWith('!')) {
      // If this is a negated pattern, it can override a previous match
      const negatedPattern = pattern.substring(1);
      if (minimatch(relativePath, negatedPattern)) {
        // This file matches a negated pattern, so it should NOT be ignored
        shouldIgnore = false;
        logVerbose(`Un-ignoring ${relativePath} based on negated pattern ${pattern}`);
      }
    } else {
      // Regular pattern
      if (minimatch(relativePath, pattern)) {
        // This file matches a pattern to ignore
        shouldIgnore = true;
        logVerbose(`Ignoring ${relativePath} based on pattern ${pattern}`);
      }
    }
  }
  
  return shouldIgnore;
}

/**
 * Check if a file potentially contains JSX components
 */
function isJSXFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ['.js', '.jsx', '.tsx', '.ts'].includes(extension);
}

/**
 * Calculate line and column from character position
 */
function getLineAndColumn(text, position) {
  if (position === 0) return { line: 1, column: 1 };
  
  const lines = text.slice(0, position).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

/**
 * Get preceding JSDoc comment if one exists
 */
function findPrecedingComment(text, componentStart) {
  // Get the portion of text before the component
  const preComponent = text.substring(0, componentStart);
  
  // Search for comment end pattern
  const commentEndIndex = preComponent.lastIndexOf('*/');
  if (commentEndIndex === -1) return null;
  
  // Now find the start of this comment
  const commentStartIndex = preComponent.lastIndexOf('/**', commentEndIndex);
  if (commentStartIndex === -1) return null;
  
  // Check if there's only whitespace and newlines between the comment and component
  const betweenText = preComponent.substring(commentEndIndex + 2).trim();
  if (betweenText !== '') return null;
  
  return {
    comment: preComponent.substring(commentStartIndex, commentEndIndex + 2),
    start: commentStartIndex,
    end: commentEndIndex + 2
  };
}

/**
 * Extract components from a file
 */
function extractComponentsFromFile(filePath, fileContent, relativePath) {
  const components = [];
  
  // Try to parse the file
  let ast;
  try {
    // Handle JSX and TypeScript
    const extension = path.extname(filePath).toLowerCase();
    const plugins = ['jsx'];
    
    if (extension === '.ts' || extension === '.tsx') {
      plugins.push('typescript');
    }
    
    plugins.push('classProperties');
    plugins.push('objectRestSpread');
    plugins.push('dynamicImport');
    
    ast = babylon.parse(fileContent, {
      sourceType: 'module',
      plugins: plugins
    });
  } catch (parseError) {
    logVerbose(`Failed to parse ${relativePath}: ${parseError.message}`);
    return components;
  }

  // Function to handle component extraction
  function addComponent(name, startNode, endNode, type) {
    const startPos = startNode.start;
    const endPos = endNode.end;
    
    // Calculate location information
    const location = getLineAndColumn(fileContent, startPos);
    
    // Check for existing docstring
    const existingComment = findPrecedingComment(fileContent, startPos);
    
    // Include the component code
    const componentCode = fileContent.substring(startPos, endPos);
    
    // Generate a unique ID to handle multiple components with the same name
    // Include file path and location info in the ID
    const uniqueId = `${name}_${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}_${location.line}_${location.column}`;
    
    // Add to component list
    components.push({
      name,
      uniqueId,
      file: relativePath,
      filePath, // Store the absolute path
      code: componentCode,
      location,
      startPos,
      endPos,
      existingComment: existingComment ? existingComment.comment : null,
      commentStart: existingComment ? existingComment.start : null, 
      commentEnd: existingComment ? existingComment.end : null,
      type
    });
  }
  
  // Use babel traverse to find components
  traverse(ast, {
    // Function components
    FunctionDeclaration(path) {
      const { node } = path;
      if (node.id && t.isIdentifier(node.id) && /^[A-Z]/.test(node.id.name)) {
        addComponent(node.id.name, node, node, 'FunctionComponent');
      }
    },
    
    // Arrow function and styled components
    VariableDeclarator(path) {
      const { node } = path;
      
      if (node.id && t.isIdentifier(node.id) && /^[A-Z]/.test(node.id.name)) {
        const name = node.id.name;
        const init = node.init;
        let type = 'Component';
        let isComponent = false;
        
        // Check component type
        if (t.isArrowFunctionExpression(init)) {
          type = 'ArrowFunctionComponent';
          isComponent = true;
        } else if (t.isCallExpression(init)) {
          const callee = init.callee;
          if (callee) {
            if (t.isIdentifier(callee) && 
                ['styled', 'memo', 'forwardRef'].includes(callee.name)) {
              type = callee.name === 'styled' ? 'StyledComponent' : 'HOCComponent';
              isComponent = true;
            } else if (t.isMemberExpression(callee) && callee.property && 
                      ['styled', 'memo', 'forwardRef'].includes(callee.property.name)) {
              type = callee.property.name === 'styled' ? 'StyledComponent' : 'HOCComponent';
              isComponent = true;
            }
          }
        }
        
        if (isComponent) {
          const declaration = path.findParent(p => p.isVariableDeclaration());
          if (declaration && declaration.node) {
            addComponent(name, declaration.node, declaration.node, type);
          }
        }
      }
    },
    
    // Class components
    ClassDeclaration(path) {
      const { node } = path;
      const superClass = node.superClass;
      
      if (superClass && 
          ((t.isIdentifier(superClass) && superClass.name === 'Component') ||
          (t.isMemberExpression(superClass) && 
            superClass.object.name === 'React' && 
            superClass.property.name === 'Component'))) {
        
        addComponent(node.id.name, node, node, 'ClassComponent');
      }
    }
  });
  
  // Sort components by their position in the file (ascending)
  components.sort((a, b) => a.startPos - b.startPos);
  
  return components;
}

/**
 * Process a file to extract components
 */
async function processFile(filePath, ignorePatterns, baseDir) {
  try {
    // Skip ignored files
    if (isIgnored(filePath, ignorePatterns, baseDir)) {
      return [];
    }
    
    // Skip non-JSX files
    if (!isJSXFile(filePath)) {
      return [];
    }
    
    const relativePath = path.relative(baseDir, filePath);
    logVerbose(`Processing ${relativePath}`);
    
    // Read file content
    let fileContent;
    try {
      fileContent = await readFile(filePath, 'utf8');
    } catch (readError) {
      try {
        // Try with latin1 encoding if utf8 fails
        fileContent = await readFile(filePath, 'latin1');
      } catch (err) {
        console.error(`Error reading file ${relativePath}: ${err.message}`);
        return [];
      }
    }
    
    // Extract components
    const components = extractComponentsFromFile(filePath, fileContent, relativePath);
    
    if (components.length > 0) {
      logVerbose(`Found ${components.length} components in ${relativePath}: ${components.map(c => c.name).join(', ')}`);
    }
    
    return components;
  } catch (error) {
    // log full error message
    console.error(`Error processing file ${filePath}: ${error.message}`);
    console.error(error);
    return [];
  }
}

/**
 * Recursively scan directory for React components
 */
async function scanDirectory(dir, ignorePatterns, baseDir) {
  const componentsByFile = {};
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip ignored paths
      if (isIgnored(fullPath, ignorePatterns, baseDir)) {
        logVerbose(`Ignoring ${fullPath}`);
        continue;
      }
      // ignore all top level .folders 
      logVerbose(`Scanning ${fullPath}`);
      if (entry.isDirectory()) {
        // Recursive call for directories
        const subdirComponents = await scanDirectory(fullPath, ignorePatterns, baseDir);
        // Merge results
        Object.assign(componentsByFile, subdirComponents);
      } else if (entry.isFile()) {
        // Process individual files
        const components = await processFile(fullPath, ignorePatterns, baseDir);
        
        if (components.length > 0) {
          componentsByFile[fullPath] = components;
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}: ${error.message}`);
  }
  
  return componentsByFile;
}

/**
 * Main function to extract components from a project
 */
async function extractComponentsFromProject(projectDir, options = {}) {
  const ignorePatterns = await loadGitignore(projectDir);
  
  // Scan the project directory for components
  // if project directory does not end with a src folder, add src to the end of the project directory
  if (!projectDir.endsWith('src')) {
    projectDir = projectDir + '/src';
  }
  const componentsByFile = await scanDirectory(projectDir, ignorePatterns, projectDir);
  
  // Return components organized by file
  return componentsByFile;
}

export {
  extractComponentsFromProject,
  findPrecedingComment,
  getLineAndColumn,
  isJSXFile,
  isIgnored
};
