/**
 * Configuration Loader
 * 
 * Loads analyzer configuration from files
 */

const fs = require('fs');
const path = require('path');

// Default configuration directory
const DEFAULT_CONFIG_DIR = path.join(__dirname, '..', 'config');

/**
 * Load main configuration
 * @param {string} configDir Directory containing configuration files
 * @returns {Object} Loaded configuration
 */
async function loadConfiguration(configDir = DEFAULT_CONFIG_DIR) {
  try {
    // Load main configuration
    const mainConfigPath = path.join(configDir, 'analyzer-config.json');
    const mainConfig = loadJsonFile(mainConfigPath);
    
    // Load product configurations
    const productsDir = path.join(configDir, 'products');
    mainConfig.products = await loadProductConfigurations(productsDir);
    
    return mainConfig;
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Load all product configurations from the products directory
 * @param {string} productsDir Directory containing product configurations
 * @returns {Array<Object>} List of product configurations
 */
async function loadProductConfigurations(productsDir) {
  try {
    // Check if directory exists
    if (!fs.existsSync(productsDir)) {
      throw new Error(`Products directory not found: ${productsDir}`);
    }
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(productsDir)
      .filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      console.warn(`No product configuration files found in ${productsDir}`);
      return [];
    }
    
    // Load each product configuration
    const products = [];
    for (const file of files) {
      try {
        const filePath = path.join(productsDir, file);
        const product = loadJsonFile(filePath);
        
        // Validate product configuration
        if (!product.name) {
          console.warn(`Skipping ${file}: Missing product name`);
          continue;
        }
        
        if (!Array.isArray(product.indicators)) {
          console.warn(`Skipping ${file}: Missing or invalid indicators array`);
          continue;
        }
        
        products.push(product);
      } catch (error) {
        console.warn(`Error loading ${file}: ${error.message}`);
      }
    }
    
    return products;
  } catch (error) {
    throw new Error(`Failed to load product configurations: ${error.message}`);
  }
}

/**
 * Load and parse a JSON file
 * @param {string} filePath Path to the JSON file
 * @returns {Object} Parsed JSON content
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    } else {
      throw new Error(`Error reading ${filePath}: ${error.message}`);
    }
  }
}

module.exports = {
  loadConfiguration,
  loadProductConfigurations
}; 