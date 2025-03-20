// lib/logger.js

let isVerbose = false;

/**
 * Initialize the logger
 * @param {boolean} verbose - Whether to enable verbose logging
 */
function initLogger(verbose) {
  isVerbose = verbose;
}

/**
 * Log a message if verbose mode is enabled
 * @param {string} message - Message to log
 */
function logVerbose(message) {
  if (isVerbose) {
    console.log(message);
  }
}

/**
 * Log a message with a timestamp
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

export {
  initLogger,
  logVerbose,
  log
};
