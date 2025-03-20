// lib/docstring-generator.js

import { logVerbose } from './utils/logger.js';
import { generateDocStringWithOpenAI, generateBasicDocString } from './utils/openai-utils.js';

/**
 * Sleep for the specified milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a batch of components to generate docstrings
 */
async function processBatch(batch, openaiClient, options) {
  const results = {};
  
  // Use Promise.all to process components in parallel
  const promises = batch.map(async (component) => {
    try {
      // Skip if it has an existing comment and we're told to skip those
      if (options.skipExisting && component.existingComment) {
        logVerbose(`Skipping ${component.name} - already has documentation`);
        return { id: component.uniqueId, docstring: null, skipped: true };
      }
      
      let docString;
      
      // Generate docstring with OpenAI if available
      if (openaiClient && component.code) {
        try {
          logVerbose(`Generating enhanced docstring for ${component.name} using OpenAI...`);
          
          docString = await generateDocStringWithOpenAI(
            openaiClient,
            component.name, 
            component.file, 
            component.location, 
            component.code,
            component.type || 'Component'
          );
        } catch (error) {
          console.error(`Error generating enhanced docstring for ${component.name}:`, error.message);
          // Fallback to basic docstring
          docString = generateBasicDocString(component.name, component.file, component.location, component.type || 'Component');
        }
      } else {
        // Use basic docstring generator
        docString = generateBasicDocString(component.name, component.file, component.location, component.type || 'Component');
      }
      
      docString = sanitizeDocString(docString);

      return { id: component.uniqueId, docstring: docString, skipped: false };
    } catch (error) {
      console.error(`Error processing component ${component.name}:`, error.message);
      return { id: component.uniqueId, docstring: null, error: error.message };
    }
  });
  
  // Wait for all promises to resolve
  const batchResults = await Promise.all(promises);
  
  // Convert array of results to an object keyed by component ID
  batchResults.forEach(result => {
    results[result.id] = {
      docstring: result.docstring,
      skipped: result.skipped || false,
      error: result.error || null
    };
  });
  
  return results;
}

/**
 * Generate docstrings for all components
 */
async function generateDocStrings(componentsByFile, openaiClient, options) {
  const results = {};
  
  // Flatten components from all files into a single array
  const allComponents = [];
  Object.values(componentsByFile).forEach(fileComponents => {
    allComponents.push(...fileComponents);
  });
  
  const totalComponents = allComponents.length;
  console.log(`Generating docstrings for ${totalComponents} components...`);
  
  // Determine batch size based on options or rate limit
  const batchSize = options.batchSize || Math.min(5, Math.floor(options.rateLimit / 2));
  const totalBatches = Math.ceil(totalComponents / batchSize);
  
  // Process components in batches
  for (let i = 0; i < totalComponents; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = allComponents.slice(i, i + batchSize);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} components)`);
    
    // Process the batch
    const batchResults = await processBatch(batch, openaiClient, options);
    
    // Merge results
    Object.assign(results, batchResults);
    
    // Wait before processing the next batch to respect rate limits (if OpenAI is used)
    if (i + batchSize < totalComponents && openaiClient) {
      const delayMs = (60000 / options.rateLimit) * batchSize;
      console.log(`Waiting ${delayMs}ms before next batch (rate limit: ${options.rateLimit}/minute)...`);
      await sleep(delayMs);
    }
  }
  
  return results;
}

/**
 * Sanitize the generated docstring
 */
function sanitizeDocString(docString) {
  // Remove nested comment delimiters that could break the docstring
  
  // Replace /** with blank
  let sanitized = docString.replace(/\/\*\*/g, "");
  
  // Replace /* with blank
  sanitized = docString.replace(/\/\*/g, "");
  
  // Replace **/ with blank
  sanitized = sanitized.replace(/\*\*\//g, "");
  // Replace */ with blank
  sanitized = sanitized.replace(/\*\//g, "");
  
  // Make sure the docstring starts with /** if it doesn't already
  if (!sanitized.startsWith('/**')) {
    sanitized = `/**${sanitized.startsWith('*') ? '' : '\n *'} ${sanitized}`;
  }
  
  // Make sure the docstring ends with */ if it doesn't already
  if (!sanitized.endsWith('*/')) {
    sanitized = `${sanitized}\n */`;
  }
  
  return sanitized;
}

export {
  generateDocStrings
};
