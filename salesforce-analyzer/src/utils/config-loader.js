/**
 * Configuration Loader Utility
 * 
 * Provides functions for loading and validating configuration files
 */
const fs = require('fs');
const path = require('path');

/**
 * Load the main configuration file
 * 
 * @param {string} configPath - Optional path to the config file
 * @returns {Object} - Loaded configuration
 */
function loadMainConfig(configPath) {
  const defaultPath = path.resolve(__dirname, '../../config/analyzer-config.json');
  const filePath = configPath || defaultPath;
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Error parsing configuration file: ${error.message}`);
  }
}

/**
 * Load a specific product definition
 * 
 * @param {string} productKey - Product key (e.g., 'salesCloud')
 * @param {string} configDir - Optional directory containing product configs
 * @returns {Object} - Loaded product definition
 */
function loadProductDefinition(productKey, configDir) {
  const defaultDir = path.resolve(__dirname, '../../config/products');
  const directory = configDir || defaultDir;
  const filePath = path.join(directory, `${productKey}.json`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Product definition not found: ${filePath}`);
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Error parsing product definition: ${error.message}`);
  }
}

/**
 * Load all product definitions
 * 
 * @param {string} configDir - Optional directory containing product configs
 * @returns {Object} - Map of product definitions keyed by product key
 */
function loadAllProductDefinitions(configDir) {
  const defaultDir = path.resolve(__dirname, '../../config/products');
  const directory = configDir || defaultDir;
  
  if (!fs.existsSync(directory)) {
    throw new Error(`Products directory not found: ${directory}`);
  }
  
  const productFiles = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
  const products = {};
  
  for (const file of productFiles) {
    const productKey = file.replace('.json', '');
    products[productKey] = loadProductDefinition(productKey, directory);
  }
  
  return products;
}

/**
 * Validate a configuration object against expected schema
 * 
 * @param {Object} config - Configuration to validate
 * @returns {boolean} - Whether the configuration is valid
 */
function validateConfig(config) {
  // Check required top-level properties
  if (!config.scoringEngine || !config.scoringEngine.algorithms) {
    throw new Error('Invalid configuration: missing scoringEngine.algorithms');
  }
  
  // Check for default algorithm
  if (!config.scoringEngine.algorithms.default) {
    throw new Error('Invalid configuration: missing default algorithm');
  }
  
  // Check for required algorithm properties
  const algorithm = config.scoringEngine.algorithms.default;
  
  if (!algorithm.evidenceWeights) {
    throw new Error('Invalid configuration: missing evidenceWeights');
  }
  
  if (!algorithm.thresholds) {
    throw new Error('Invalid configuration: missing thresholds');
  }
  
  return true;
}

/**
 * Validate a product definition against expected schema
 * 
 * @param {Object} definition - Product definition to validate
 * @returns {boolean} - Whether the definition is valid
 */
function validateProductDefinition(definition) {
  // Check required properties
  if (!definition.name) {
    throw new Error('Invalid product definition: missing name');
  }
  
  if (!definition.indicators || !Array.isArray(definition.indicators)) {
    throw new Error('Invalid product definition: missing indicators array');
  }
  
  // Check each indicator category
  for (const category of definition.indicators) {
    if (!category.category || !category.items || !Array.isArray(category.items)) {
      throw new Error(`Invalid indicator category in ${definition.name}: missing category or items`);
    }
    
    // Check each indicator item
    for (const item of category.items) {
      if (!item.type || !item.name || item.weight === undefined) {
        throw new Error(`Invalid indicator item in ${category.category}: missing type, name, or weight`);
      }
    }
  }
  
  return true;
}

module.exports = {
  loadMainConfig,
  loadProductDefinition,
  loadAllProductDefinitions,
  validateConfig,
  validateProductDefinition
}; 