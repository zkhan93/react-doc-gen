// lib/openai-utils.js

import openai from 'openai';
import fs from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';


const mkdirAsync = mkdir;
const writeFileAsync = writeFile;
const readFileAsync = readFile;

// Cache directory for component documentation

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);
// get current project root directory
const projectRoot = path.resolve(path.dirname(''));
const CACHE_DIR = path.join(projectRoot, '.react-doc-gen');

/**
 * Initialize the OpenAI client with API key
 * @returns {Object|null} OpenAI client or null if no API key available
 */
function setupOpenAI() {
  // Ensure cache directory exists
  ensureCacheDirectory();
  
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  
  return new openai.OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Ensure the cache directory exists
 */
async function ensureCacheDirectory() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      await mkdirAsync(CACHE_DIR, { recursive: true });
      console.log(`Created documentation cache directory: ${CACHE_DIR}`);
    }else{
      console.log(`Documentation cache directory already exists: ${CACHE_DIR}`);
    }
  } catch (error) {
    console.error(`Error creating cache directory: ${error.message}`);
  }
}

/**
 * Get the file path for a specific component hash
 * @param {string} hash - Component hash
 * @returns {string} Path to the cache file
 */
function getCacheFilePath(hash) {
  return path.join(CACHE_DIR, `${hash}.json`);
}

/**
 * Check if documentation for a component hash exists in cache
 * @param {string} hash - Component hash
 * @returns {boolean} True if cache exists
 */
function docCacheExists(hash) {
  const cachePath = getCacheFilePath(hash);
  return fs.existsSync(cachePath);
}

/**
 * Load documentation from cache
 * @param {string} hash - Component hash
 * @returns {Promise<string|null>} The cached documentation or null if not found
 */
async function loadDocFromCache(hash) {
  try {
    const cachePath = getCacheFilePath(hash);
    if (fs.existsSync(cachePath)) {
      const content = await readFileAsync(cachePath, 'utf8');
      const cacheData = JSON.parse(content);
      return cacheData.docstring;
    }
  } catch (error) {
    console.error(`Error loading doc from cache (${hash}): ${error.message}`);
  }
  return null;
}

/**
 * Save documentation to cache
 * @param {string} hash - Component hash
 * @param {string} docstring - Documentation to cache
 */
async function saveDocToCache(hash, docstring) {
  try {
    const cachePath = getCacheFilePath(hash);
    const cacheData = {
      docstring,
      timestamp: new Date().toISOString()
    };
    await writeFileAsync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error saving doc to cache (${hash}): ${error.message}`);
  }
}

/**
 * Calculate hash for a component
 * @param {string} componentCode - Component code to hash
 * @returns {string} Hash string
 */
function calculateComponentHash(componentCode) {
  return crypto.createHash('md5').update(componentCode).digest('hex');
}

/**
 * Generate a docstring using OpenAI
 * @param {Object} openaiClient - Initialized OpenAI client
 * @param {string} componentName - Name of the component
 * @param {string} filePath - Path to the file containing the component
 * @param {Object} location - Line and column information
 * @param {string} componentCode - The component code
 * @param {string} componentType - Type of component (Function, Class, etc.)
 * @returns {Promise<string>} Generated docstring
 */
async function generateDocStringWithOpenAI(openaiClient, componentName, filePath, location, componentCode, componentType) {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }
  
  // Calculate component hash
  const componentHash = calculateComponentHash(componentCode);
  
  // Check if we have cached documentation for this component
  const cachedDoc = await loadDocFromCache(componentHash);
  if (cachedDoc) {
    console.log(`Using cached documentation for ${componentName}`);
    return cachedDoc;
  }
  
  try {
    // Create a prompt that asks the model to analyze the component
    const prompt = `
You are a React documentation expert. I need a detailed JSDoc-style documentation for the following React ${componentType}:

Component Name: ${componentName}
File Path: ${filePath}
Component Code:
\`\`\`jsx
${componentCode}
\`\`\`

Based on the code, please generate a comprehensive JSDoc comment that includes:
1. A clear description of what the component does
2. All props it accepts with accurate types and descriptions
3. Return value description
4. Any side effects or important notes
5. A basic usage example

Format the response as a complete JSDoc comment block (starting with /** and ending with */).
Your response should be a JSON object with a single field 'docstring' containing the complete JSDoc comment.
`;

    // Call the OpenAI API with JSON response format
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo", // or another appropriate model
      messages: [
        { role: "system", content: "You are a React documentation specialist who writes precise and helpful JSDoc comments." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Lower temperature for more predictable output
      max_tokens: 1000 // Adjust as needed
    });

    // Parse the JSON response to extract just the docstring
    const responseContent = response.choices[0].message.content;
    const parsedResponse = JSON.parse(responseContent);
    let docstring = parsedResponse.docstring.trim();
    
    // Make sure it starts with /** if it doesn't already
    if (!docstring.startsWith('/**')) {
      docstring = `/**${docstring.startsWith('*') ? '' : '\n *'} ${docstring}`;
    }
    
    // Make sure it ends with */ if it doesn't already
    if (!docstring.endsWith('*/')) {
      docstring = `${docstring}\n */`;
    }
    
    // Cache the generated docstring
    await saveDocToCache(componentHash, docstring);
    
    return docstring;
    
  } catch (error) {
    console.error('Error generating documentation with OpenAI:', error);
    throw error;
  }
}

/**
 * Generate a basic docstring for fallback when OpenAI isn't available
 */
function generateBasicDocString(componentName, filePath, location, componentType) {
  return `/**
 * ${componentName} Component
 *
 * @description A React component defined in ${filePath} (line ${location.line}, column ${location.column})
 * @component ${componentType}
 * @param {Object} props - Component props
 * @returns {React.ReactElement} A React component
 */`;
}

export {
  setupOpenAI,
  generateDocStringWithOpenAI,
  generateBasicDocString,
  calculateComponentHash,
  ensureCacheDirectory,
  loadDocFromCache,
  saveDocToCache,
  docCacheExists
};
