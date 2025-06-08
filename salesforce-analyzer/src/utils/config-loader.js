/**
 * Configuration Loader Utility
 * 
 * Provides functions for loading and validating configuration files
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load the main configuration file
 * 
 * @param {string} configPath - Optional path to the config file
 * @returns {Object} - Loaded configuration
 */
export function loadMainConfig(configPath) {
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
 * @param {string} productKey - Product key from configuration
 * @param {string} configDir - Optional directory containing product configs
 * @returns {Object} - Loaded product definition
 */
export function loadProductDefinition(productKey, configDir) {
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
export function loadAllProductDefinitions(configDir) {
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
export function validateConfig(config) {
  // Check required top-level properties
  if (!config.products) {
    throw new Error('Invalid configuration: missing products section');
  }
  
  // Check for required product properties
  for (const [key, product] of Object.entries(config.products)) {
    if (!product.name) {
      throw new Error(`Invalid product configuration for ${key}: missing name`);
    }
    if (!product.configFile) {
      throw new Error(`Invalid product configuration for ${key}: missing configFile`);
    }
  }
  
  return true;
}

/**
 * Validate a product definition against expected schema
 * 
 * @param {Object} definition - Product definition to validate
 * @returns {boolean} - Whether the definition is valid
 */
export function validateProductDefinition(definition) {
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
      if (!item.type || !item.name) {
        throw new Error(`Invalid indicator item in ${category.category}: missing type or name`);
      }
    }
  }
  
  return true;
} 