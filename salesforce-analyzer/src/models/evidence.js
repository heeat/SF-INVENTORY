/**
 * Model representing a piece of evidence collected during analysis
 */
export class Evidence {
  /**
   * Create a new evidence item
   * 
   * @param {string} type - Type of evidence (object, feature, activity, etc.)
   * @param {string} name - Name of the evidence
   * @param {boolean} detected - Whether the evidence was detected
   * @param {Object} details - Additional details about the evidence
   * @param {Date} timestamp - When the evidence was collected or last observed
   */
  constructor(type, name, detected, details = {}, timestamp = new Date()) {
    this.type = type;
    this.name = name;
    this.detected = detected;
    this.details = details;
    this.timestamp = timestamp;
  }
}

/**
 * Collection of evidence for a specific product
 */
export class EvidenceCollection {
  /**
   * Create a new evidence collection
   * 
   * @param {string} productName - The name of the product this evidence relates to
   */
  constructor(productName) {
    this.productName = productName;
    this.items = [];
    this.categorizedItems = {};
  }
  
  /**
   * Add evidence to the collection
   * 
   * @param {Evidence} evidence - The evidence item to add
   */
  addEvidence(evidence) {
    this.items.push(evidence);
    
    // Also categorize by type
    if (!this.categorizedItems[evidence.type]) {
      this.categorizedItems[evidence.type] = [];
    }
    
    this.categorizedItems[evidence.type].push(evidence);
  }
  
  /**
   * Get all evidence of a specific type
   * 
   * @param {string} type - The type of evidence to retrieve
   * @returns {Array<Evidence>} - Evidence items of the specified type
   */
  getEvidenceByType(type) {
    return this.categorizedItems[type] || [];
  }
  
  /**
   * Get all detected evidence
   * 
   * @returns {Array<Evidence>} - All detected evidence items
   */
  getDetectedEvidence() {
    return this.items.filter(item => item.detected);
  }
} 