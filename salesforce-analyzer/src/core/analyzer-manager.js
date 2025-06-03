/**
 * Analyzer Manager
 * 
 * Central coordinator for all product analyzers
 */
const path = require('path');
const ProductAnalyzer = require('../analyzers/product-analyzer');
const { 
  loadMainConfig, 
  loadAllProductDefinitions, 
  validateConfig 
} = require('../utils/config-loader');
const {
  generateSummaryReport,
  generateDetailedReport,
  generateTextReport,
  generateCsvReport
} = require('../utils/report-generator');

class AnalyzerManager {
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
   * Run analysis for a specific product
   * 
   * @param {string} productKey - Product key
   * @returns {Promise<AnalysisResult>} - Analysis result
   */
  async analyzeProduct(productKey) {
    if (!this.availableProducts.includes(productKey)) {
      throw new Error(`No analyzer available for ${productKey}. Available products: ${this.availableProducts.join(', ')}`);
    }
    
    console.log(`Starting analysis for ${productKey}...`);
    const analyzer = new ProductAnalyzer(this.connection, this.config, productKey);
    const result = await analyzer.analyze();
    console.log(`Analysis complete for ${productKey}`);
    
    return result;
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
      const analyzer = new ProductAnalyzer(this.connection, this.config, productKey);
      results[productKey] = await analyzer.analyze();
      console.log(`Analysis complete for ${productKey}`);
    }
    
    return results;
  }
  
  /**
   * Generate a summary report of all products
   * 
   * @param {Object} results - Analysis results
   * @returns {Object} - Summary report
   */
  generateSummaryReport(results) {
    return generateSummaryReport(results);
  }
  
  /**
   * Generate a detailed report for a product
   * 
   * @param {AnalysisResult} result - Analysis result
   * @returns {Object} - Detailed report
   */
  generateDetailedReport(result) {
    return generateDetailedReport(result);
  }
  
  /**
   * Generate a human-readable text report
   * 
   * @param {AnalysisResult} result - Analysis result
   * @returns {string} - Text report
   */
  generateTextReport(result) {
    return generateTextReport(result);
  }
  
  /**
   * Generate a CSV report of all products
   * 
   * @param {Object} results - Analysis results
   * @returns {string} - CSV content
   */
  generateCsvReport(results) {
    return generateCsvReport(results);
  }
}

module.exports = AnalyzerManager; 