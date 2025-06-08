/**
 * Universal Product Analyzer
 * 
 * A configurable analyzer that can detect feature implementation in any Salesforce product
 * based on its definition in the configuration.
 */
import EvidenceCollector from '../core/evidence-collector.js';
import { EvidenceCollection } from '../models/evidence.js';
import AnalysisResult from '../models/analysis-result.js';
import { loadProductDefinition } from '../utils/config-loader.js';

export default class ProductAnalyzer {
  /**
   * Create a new product analyzer
   * 
   * @param {Object} connection - Salesforce connection
   * @param {Object} config - Global configuration
   * @param {string} productKey - Key identifier for the product (e.g., 'salesCloud')
   */
  constructor(connection, config, productKey) {
    this.connection = connection;
    this.config = config;
    this.productKey = productKey;
    this.evidenceCollector = new EvidenceCollector(connection);
    
    // Load product definition from config
    this.productDefinition = config.products[productKey];
    
    // If not found in loaded config, try to load it directly
    if (!this.productDefinition) {
      this.productDefinition = loadProductDefinition(productKey);
    }
    
    if (!this.productDefinition) {
      throw new Error(`Product definition not found for: ${productKey}`);
    }
  }
  
  /**
   * Run the analysis for this product
   * 
   * @returns {Promise<AnalysisResult>} - Analysis result
   */
  async analyze() {
    console.log(`Starting ${this.productDefinition.name} analysis...`);
    
    // Create evidence collection
    const evidence = new EvidenceCollection(this.productDefinition.name);
    
    try {
      // Process each indicator category
      for (const category of this.productDefinition.indicators) {
        console.log(`Analyzing ${category.category}...`);
        
        if (!category.items) {
          console.warn(`No items defined for category: ${category.category}`);
          continue;
        }
        
        for (const item of category.items) {
          let evidenceItem;
          
          switch (item.type) {
            case 'object':
              evidenceItem = await this.processObjectIndicator(item);
              break;
              
            case 'feature':
              evidenceItem = await this.processFeatureIndicator(item);
              break;
              
            case 'activity':
              evidenceItem = await this.processActivityIndicator(item);
              break;
              
            case 'integration':
            case 'api':
              evidenceItem = await this.processIntegrationIndicator(item);
              break;
              
            case 'code':
              evidenceItem = await this.processCodeIndicator(item);
              break;
              
            default:
              console.warn(`Unknown indicator type: ${item.type}`);
              continue;
          }
          
          if (evidenceItem) {
            evidence.addEvidence(evidenceItem);
          }
        }
      }
      
      // Generate findings
      const findings = this.generateFindings(evidence);
      
      // Create and return result
      return new AnalysisResult(
        this.productDefinition.name,
        this.summarizeEvidence(evidence),
        null, // No edition determination yet
        evidence.items, // Use the items array directly
        findings
      );
    } catch (error) {
      console.error('Error during analysis:', error);
      throw error;
    }
  }
  
  /**
   * Process an object indicator
   * 
   * @param {Object} item - Object indicator definition
   * @returns {Promise<Evidence>} - Evidence about the object
   */
  async processObjectIndicator(item) {
    try {
      // Check object presence
      const objectEvidence = await this.evidenceCollector.checkObject(item.name, {
        requiredFields: item.requiredFields,
        checkRecordCount: true,
        checkLastModified: true
      });
      
      // If object exists, also check usage
      if (objectEvidence.detected) {
        const usageEvidence = await this.evidenceCollector.checkObjectUsage(item.name, {
          threshold: item.activityThreshold,
          timeframe: 'last30Days'
        });
        
        // Enhance object evidence with usage details
        objectEvidence.details = {
          ...objectEvidence.details,
          usage: {
            detected: usageEvidence.detected,
            count: usageEvidence.details.count,
            threshold: usageEvidence.details.threshold
          }
        };
      }
      
      return objectEvidence;
    } catch (error) {
      console.error(`Error processing object indicator ${item.name}:`, error);
      return null;
    }
  }
  
  /**
   * Process a feature indicator
   * 
   * @param {Object} item - Feature indicator definition
   * @returns {Promise<Evidence>} - Evidence about the feature
   */
  async processFeatureIndicator(item) {
    try {
      return await this.evidenceCollector.checkFeature(
        item.name, 
        item.detectionMethods || []
      );
    } catch (error) {
      console.error(`Error processing feature indicator ${item.name}:`, error);
      return null;
    }
  }
  
  /**
   * Process an activity indicator
   * 
   * @param {Object} item - Activity indicator definition
   * @returns {Promise<Evidence>} - Evidence about the activity
   */
  async processActivityIndicator(item) {
    try {
      const method = item.detectionMethods && item.detectionMethods[0];
      if (!method) {
        console.warn(`No detection methods for activity indicator ${item.name}`);
        return null;
      }
      
      return await this.evidenceCollector.checkUserActivity(item.name, {
        type: method.type,
        eventType: method.eventType,
        pattern: method.pattern,
        timeframe: method.timeframe,
        threshold: method.threshold
      });
    } catch (error) {
      console.error(`Error processing activity indicator ${item.name}:`, error);
      return null;
    }
  }
  
  /**
   * Process an integration indicator
   * 
   * @param {Object} item - Integration indicator definition
   * @returns {Promise<Evidence>} - Evidence about the integration
   */
  async processIntegrationIndicator(item) {
    try {
      if (item.type === 'api') {
        const method = item.detectionMethods && item.detectionMethods[0];
        if (!method) {
          console.warn(`No detection methods for API indicator ${item.name}`);
          return null;
        }
        
        return await this.evidenceCollector.checkApiUsage(item.name, {
          object: method.object,
          timeframe: method.timeframe,
          threshold: method.threshold
        });
      }
      
      // For other integration types, check using feature methods
      return await this.evidenceCollector.checkFeature(
        item.name, 
        item.detectionMethods || []
      );
    } catch (error) {
      console.error(`Error processing integration indicator ${item.name}:`, error);
      return null;
    }
  }
  
  /**
   * Process a code indicator
   * 
   * @param {Object} item - Code indicator definition
   * @returns {Promise<Evidence>} - Evidence about the code
   */
  async processCodeIndicator(item) {
    try {
      return await this.evidenceCollector.checkFeature(
        item.name, 
        item.detectionMethods || []
      );
    } catch (error) {
      console.error(`Error processing code indicator ${item.name}:`, error);
      return null;
    }
  }
  
  /**
   * Generate findings from evidence
   * 
   * @param {EvidenceCollection} evidence - Evidence collection
   * @returns {Array} - List of findings
   */
  generateFindings(evidence) {
    // This would generate findings based on the evidence collected
    // For now, return an empty array
    return [];
  }
  
  /**
   * Summarize evidence into a format suitable for reporting
   * 
   * @param {EvidenceCollection} evidence - Collection of evidence
   * @returns {Array<Object>} - Summary of evidence
   */
  summarizeEvidence(evidence) {
    console.log('\nSummarizing evidence...');
    const summary = [];
    
    for (const item of evidence.items) {
      console.log('Processing evidence item:', JSON.stringify(item, null, 2));
      
      const summaryItem = {
        name: item.name,
        type: item.type,
        detected: item.detected,
        recordCount: item.details?.recordCount,
        customFields: item.details?.customFields,
        lastUsed: item.details?.lastModified,
        usageCount: item.details?.usage?.count,
        description: this.formatDescription(item)
      };
      
      console.log('Created summary item:', JSON.stringify(summaryItem, null, 2));
      summary.push(summaryItem);
    }
    
    console.log(`Created ${summary.length} summary items`);
    return summary;
  }
  
  /**
   * Format a description for an evidence item
   * 
   * @param {Object} item - Evidence item
   * @returns {string} Formatted description
   */
  formatDescription(item) {
    const parts = [];
    
    if (item.details) {
      // Object details
      if (item.details.label) {
        parts.push(`Label: ${item.details.label}`);
      }
      
      // Feature details
      if (item.details.metadata) {
        parts.push(`Type: ${item.details.metadata}`);
      }
      if (item.details.enabled !== undefined) {
        parts.push(`Enabled: ${item.details.enabled}`);
      }
      
      // Activity details
      if (item.details.timeframe) {
        parts.push(`Period: ${item.details.timeframe}`);
      }
      if (item.details.threshold) {
        parts.push(`Threshold: ${item.details.threshold}`);
      }
      
      // API/Integration details
      if (item.details.object) {
        parts.push(`Object: ${item.details.object}`);
      }
      
      // Error details
      if (item.details.error) {
        parts.push(`Error: ${item.details.error}`);
      }
    }
    
    return parts.join(' | ');
  }
} 