/**
 * Universal Product Analyzer
 * 
 * A configurable analyzer that can detect and evaluate usage of any Salesforce product
 * based on its definition in the configuration.
 */
const EvidenceCollector = require('../core/evidence-collector');
const { EvidenceCollection } = require('../models/evidence');
const AnalysisResult = require('../models/analysis-result');
const { loadProductDefinition } = require('../utils/config-loader');

class ProductAnalyzer {
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
    
    // Process each indicator category
    for (const category of this.productDefinition.indicators) {
      console.log(`Analyzing ${category.category}...`);
      
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
        
        evidence.addEvidence(evidenceItem);
      }
    }
    
    // Determine usage category based on detected features
    const detectedFeatures = evidence.getAllEvidence().filter(e => e.detected).length;
    const totalFeatures = evidence.getAllEvidence().length;
    const usageCategory = this.determineUsageCategory(detectedFeatures, totalFeatures);
    
    // Determine edition based on detected features
    const edition = this.determineEdition(this.productDefinition, evidence);
    
    // Generate findings
    const findings = this.generateFindings(evidence);
    
    // Create and return result
    return new AnalysisResult(
      this.productDefinition.name,
      usageCategory,
      edition,
      this.summarizeEvidence(evidence),
      findings
    );
  }
  
  /**
   * Process an object indicator
   * 
   * @param {Object} item - Object indicator definition
   * @returns {Promise<Evidence>} - Evidence about the object
   */
  async processObjectIndicator(item) {
    // Check object presence
    const objectEvidence = await this.evidenceCollector.checkObject(item.name, {
      weight: item.weight,
      requiredFields: item.requiredFields,
      checkRecordCount: true,
      checkLastModified: true
    });
    
    // If object exists, also check usage
    if (objectEvidence.detected) {
      const usageEvidence = await this.evidenceCollector.checkObjectUsage(item.name, {
        weight: item.weight,
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
  }
  
  /**
   * Process a feature indicator
   * 
   * @param {Object} item - Feature indicator definition
   * @returns {Promise<Evidence>} - Evidence about the feature
   */
  async processFeatureIndicator(item) {
    return this.evidenceCollector.checkFeature(item.name, item.detectionMethods, {
      weight: item.weight
    });
  }
  
  /**
   * Process an activity indicator
   * 
   * @param {Object} item - Activity indicator definition
   * @returns {Promise<Evidence>} - Evidence about the activity
   */
  async processActivityIndicator(item) {
    const method = item.detectionMethods[0];
    
    return this.evidenceCollector.checkUserActivity(item.name, {
      weight: item.weight,
      type: method.type,
      eventType: method.eventType,
      pattern: method.pattern,
      timeframe: method.timeframe,
      threshold: method.threshold
    });
  }
  
  /**
   * Process an integration indicator
   * 
   * @param {Object} item - Integration indicator definition
   * @returns {Promise<Evidence>} - Evidence about the integration
   */
  async processIntegrationIndicator(item) {
    if (item.type === 'api') {
      const method = item.detectionMethods[0];
      
      return this.evidenceCollector.checkApiUsage(item.name, {
        weight: item.weight,
        object: method.object,
        timeframe: method.timeframe,
        threshold: method.threshold
      });
    }
    
    // For other integration types, check using feature methods
    return this.evidenceCollector.checkFeature(item.name, item.detectionMethods, {
      weight: item.weight
    });
  }
  
  /**
   * Process a code indicator
   * 
   * @param {Object} item - Code indicator definition
   * @returns {Promise<Evidence>} - Evidence about code references
   */
  async processCodeIndicator(item) {
    const method = item.detectionMethods[0];
    
    return this.evidenceCollector.checkCodeReferences(item.name, {
      weight: item.weight,
      type: method.type,
      triggerObject: method.triggerObject,
      pattern: method.pattern
    });
  }
  
  /**
   * Generate a summary of the evidence
   * 
   * @param {EvidenceCollection} evidence - Collected evidence
   * @returns {Object} - Evidence summary
   */
  summarizeEvidence(evidence) {
    const detected = evidence.getDetectedEvidence();
    
    // Group by category
    const byCategory = {};
    
    for (const category of this.productDefinition.indicators) {
      const categoryItems = category.items.map(item => item.name);
      
      byCategory[category.category] = detected
        .filter(e => categoryItems.includes(e.name))
        .map(e => ({
          name: e.name,
          weight: e.weight,
          details: e.details
        }));
    }
    
    return {
      totalItems: evidence.items.length,
      detectedItems: detected.length,
      byCategory
    };
  }
  
  /**
   * Generate key findings from the evidence
   * 
   * @param {EvidenceCollection} evidence - Collected evidence
   * @returns {Array<string>} - Key findings
   */
  generateFindings(evidence) {
    // Map important objects and features to findings
    const findings = [];
    const detected = evidence.getDetectedEvidence();
    
    // Find core objects that were detected
    const coreObjects = detected
      .filter(e => e.type === 'objectPresence')
      .map(e => e.name);
      
    // Find features that were detected
    const features = detected
      .filter(e => e.type === 'featureConfiguration')
      .map(e => e.name);
      
    // Find key user activities
    const highUserActivity = detected
      .filter(e => e.type === 'userActivity' && e.details.count > e.details.threshold)
      .map(e => e.name);
      
    // Find code customizations
    const codeCustomizations = detected
      .filter(e => e.type === 'codeReferences');
      
    // Generate findings based on product definition and detected evidence
    
    // Core objects findings
    if (this.productDefinition.findingsMap && this.productDefinition.findingsMap.coreObjects) {
      const objectFindings = this.productDefinition.findingsMap.coreObjects;
      
      for (const [object, finding] of Object.entries(objectFindings)) {
        if (coreObjects.includes(object)) {
          findings.push(finding);
        }
      }
    } else {
      // Default handling for core objects
      coreObjects.forEach(objectName => {
        findings.push(`${objectName} is being used`);
      });
    }
    
    // Feature findings
    if (this.productDefinition.findingsMap && this.productDefinition.findingsMap.features) {
      const featureFindings = this.productDefinition.findingsMap.features;
      
      for (const [feature, finding] of Object.entries(featureFindings)) {
        if (features.includes(feature)) {
          findings.push(finding);
        }
      }
    } else {
      // Default handling for features
      features.forEach(featureName => {
        findings.push(`${featureName} is configured`);
      });
    }
    
    // Code customization findings
    if (codeCustomizations.length > 0) {
      findings.push(`${this.productDefinition.name} is extended with custom code (${codeCustomizations.length} components)`);
    }
    
    // User activity findings
    if (highUserActivity.length > 0) {
      findings.push(`Active user engagement with ${this.productDefinition.name} interfaces`);
    }
    
    return findings;
  }
  
  /**
   * Determine usage category based on feature detection
   * @param {number} detectedFeatures - Number of detected features
   * @param {number} totalFeatures - Total number of features checked
   * @returns {string} - Usage category
   */
  determineUsageCategory(detectedFeatures, totalFeatures) {
    const detectionRate = (detectedFeatures / totalFeatures) * 100;
    
    if (detectionRate >= 50) return 'Active';
    if (detectionRate >= 20) return 'Limited';
    if (detectionRate > 0) return 'Minimal';
    return 'Not Used';
  }

  /**
   * Determine the most likely edition based on detected features
   * 
   * @param {Object} productDefinition - Definition of the product
   * @param {EvidenceCollection} evidenceCollection - Collected evidence
   * @returns {string} - Detected edition
   */
  determineEdition(productDefinition, evidenceCollection) {
    if (!productDefinition.editionSignals) return 'Unknown';
    
    // Get all detected features
    const detectedFeatures = evidenceCollection.getEvidenceByType('featureConfiguration')
      .filter(e => e.detected)
      .map(e => e.name);
      
    // Check each edition from highest to lowest
    const editions = Object.keys(productDefinition.editionSignals);
    
    // Sort from highest to lowest (assuming order in config is lowest to highest)
    const sortedEditions = [...editions].reverse();
    
    for (const edition of sortedEditions) {
      const signals = productDefinition.editionSignals[edition];
      const matchedSignals = signals.filter(signal => 
        detectedFeatures.some(f => f.includes(signal))
      );
      
      // If half or more of the signals for this edition are matched, return it
      if (matchedSignals.length >= Math.ceil(signals.length * 0.5)) {
        return edition;
      }
    }
    
    // If we couldn't determine, return the lowest edition
    return editions[0] || 'Unknown';
  }
}

module.exports = ProductAnalyzer; 