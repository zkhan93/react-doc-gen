#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {extractComponentsFromProject} from '../src/extractor.js';
import {updateFilesWithDocStrings} from '../src/utils/file-updater.js';
import {setupOpenAI} from '../src/utils/openai-utils.js';
import {generateDocStrings} from '../src/docstring-generator.js';
import {initLogger} from '../src/utils/logger.js';
// Command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options] <project-directory>')
  .option('output', {
    alias: 'o',
    describe: 'Output directory for extracted components',
    default: 'extracted_components'
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Enable verbose logging',
    type: 'boolean',
    default: false
  })
  .option('openai-key', {
    alias: 'k',
    describe: 'OpenAI API Key (or set OPENAI_API_KEY environment variable)'
  })
  .option('rate-limit', {
    alias: 'r',
    describe: 'Maximum number of OpenAI API requests per minute',
    type: 'number',
    default: 10
  })
  .option('dry-run', {
    alias: 'd',
    describe: 'Generate docstrings but don\'t write to files',
    type: 'boolean',
    default: false
  })
  .option('skip-existing', {
    alias: 's',
    describe: 'Skip components with existing comments',
    type: 'boolean',
    default: false
  })
  .option('update-existing', {
    alias: 'u',
    describe: 'Update existing component comments',
    type: 'boolean',
    default: false
  })
  .option('batch-size', {
    alias: 'b',
    describe: 'Number of components to process concurrently',
    type: 'number',
    default: 30
  })
  .help('h')
  .alias('h', 'help')
  .demandCommand(1, 'Please specify the project directory')
  .argv;

const projectDir = path.resolve(argv._[0]);
const options = {
  outputDir: path.resolve(argv.output),
  verbose: argv.verbose,
  isDryRun: argv['dry-run'],
  rateLimit: argv['rate-limit'],
  skipExisting: argv['skip-existing'],
  updateExisting: argv['update-existing'],
  batchSize: argv['batch-size']
};
initLogger(options.verbose);

// Set OpenAI API key from command line or environment variable
if (argv['openai-key']) {
  process.env.OPENAI_API_KEY = argv['openai-key'];
}

/**
 * Main function that orchestrates the entire process
 */
async function main() {
  try {
    console.log(`Processing React components in ${projectDir}`);
    
    // Check if project directory exists
    if (!fs.existsSync(projectDir)) {
      console.error(`Project directory does not exist: ${projectDir}`);
      process.exit(1);
    }
    
    // Initialize OpenAI client if API key is available
    const openaiClient = setupOpenAI();
    if (!openaiClient) {
      console.warn('WARNING: OpenAI API key not found. Will use basic docstring generation.');
      console.warn('Set your API key with --openai-key flag or OPENAI_API_KEY environment variable.');
    } else {
      console.log('OpenAI API key found. Will generate enhanced docstrings.');
    }
    
    if (options.isDryRun) {
      console.log('Running in dry-run mode. No files will be modified.');
    }
    
    // Step 1: Extract components from project
    console.log('Extracting components from project...');
    const componentsByFile = await extractComponentsFromProject(projectDir, options);
    
    // Get total component count
    const totalComponents = Object.values(componentsByFile).reduce((count, components) => count + components.length, 0);
    
    if (totalComponents === 0) {
      console.log('No components found in the project.');
      return;
    }
    
    console.log(`Found ${totalComponents} components in ${Object.keys(componentsByFile).length} files.`);
    
    // Step 2: Generate docstrings for all components
    console.log('Generating documentation for components...');
    const componentDocStrings = await generateDocStrings(componentsByFile, openaiClient, options);
    
    // Step 3: Update files with the generated docstrings
    console.log('Updating source files with documentation...');
    const updateResults = await updateFilesWithDocStrings(componentsByFile, componentDocStrings, projectDir, options);
    
    // Print results
    console.log('\nComponent documentation generation complete:');
    console.log(`- ${updateResults.success} components documented successfully`);
    console.log(`- ${updateResults.skipped} components skipped (already documented)`);
    
    if (!options.isDryRun) {
      console.log(`- ${updateResults.failed} components failed`);
    }
    
    console.log(`\nTotal files processed: ${updateResults.filesProcessed}`);
    console.log(`Files modified: ${updateResults.filesModified}`);
    
  } catch (error) {
    console.error(`Error processing components:`, error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(`Unexpected error:`, error);
  process.exit(1);
});
