/**
 * Analyzer Manager
 * 
 * Central coordinator for all product analyzers
 */
import path from 'path';
import ProductAnalyzer from '../analyzers/product-analyzer.js';
import { 
  loadMainConfig, 
  loadAllProductDefinitions, 
  validateConfig 
} from '../utils/config-loader.js';

export class AnalyzerManager {
  /**
   * Create a new analyzer manager
   * 
   * @param {Object} connection - Salesforce connection
   * @param {string} configPath - Optional path to config directory
   */
  constructor(connection, configPath) {
    this.connection = connection;
    this.configDir = configPath;
    this.config = this.loadConfig();
    this.availableProducts = Object.keys(this.config.products);
  }
  
  /**
   * Load configuration files
   * 
   * @returns {Object} - Combined configuration
   */
  loadConfig() {
    // Load main config
    const config = loadMainConfig(
      this.configDir ? path.join(this.configDir, 'analyzer-config.json') : null
    );
    
    // Validate config
    validateConfig(config);
    
    // Load product definitions
    config.products = loadAllProductDefinitions(
      this.configDir ? path.join(this.configDir, 'products') : null
    );
    
    return config;
  }
  
  /**
   * Get available analyzers
   * 
   * @returns {Array<string>} - List of available product keys
   */
  getAvailableAnalyzers() {
    return this.availableProducts;
  }
  
  /**
   * Run analysis for all products
   * 
   * @returns {Promise<Object>} - Analysis results for all products
   */
  async analyzeAll() {
    const results = {};
    
    for (const productKey of this.availableProducts) {
      console.log(`Starting analysis for ${productKey}...`);
      console.log(`config analysis for ${JSON.parse(JSON.stringify(this.config))}...`);
      const analyzer = new ProductAnalyzer(this.connection, this.config, productKey);
      results[productKey] = await analyzer.analyze();
      // Debug: Log the actual results structure
      console.log(`Analysis complete for ${productKey}`);
    }
    
    return results;
  }
} 