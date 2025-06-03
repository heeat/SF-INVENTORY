/**
 * Scoring Engine - Calculates probability scores based on evidence
 * 
 * This engine uses a configurable algorithm to calculate the probability that
 * a particular Salesforce product is being actively used, based on various types
 * of evidence collected from the org.
 */
class ScoringEngine {
  /**
   * Create a new scoring engine
   * 
   * @param {Object} config - Configuration for the scoring algorithm
   */
  constructor(config) {
    this.config = config;
    this.algorithmConfig = config.scoringEngine.algorithms.default;
  }

  /**
   * Calculate a probability score based on collected evidence
   * 
   * @param {Object} productDefinition - Definition of the product being scored
   * @param {EvidenceCollection} evidenceCollection - Collected evidence
   * @returns {number} - Probability score (0-100)
   */
  calculateScore(productDefinition, evidenceCollection) {
    let totalScore = 0;
    let totalWeight = 0;
    
    // Process evidence by type
    Object.keys(this.algorithmConfig.evidenceWeights).forEach(evidenceType => {
      const typeWeight = this.algorithmConfig.evidenceWeights[evidenceType];
      const evidenceItems = evidenceCollection.getEvidenceByType(evidenceType);
      
      if (evidenceItems.length === 0) return;
      
      // Calculate score for this evidence type
      evidenceItems.forEach(item => {
        // Calculate base score for this evidence item
        const baseScore = this.calculateItemScore(item, evidenceType);
        
        // Apply time decay if applicable
        const decayedScore = this.applyTimeDecay(baseScore, item.timestamp);
        
        // Add to total with type weighting
        const weightedScore = decayedScore * typeWeight * item.weight;
        totalScore += weightedScore;
        totalWeight += item.weight * typeWeight;
      });
    });
    
    // Return normalized score (0-100)
    return totalWeight > 0 ? Math.min(100, Math.max(0, (totalScore / totalWeight) * 100)) : 0;
  }
  
  /**
   * Calculate a score for a single evidence item
   * 
   * @param {Evidence} item - Evidence item
   * @param {string} type - Type of evidence
   * @returns {number} - Score for this item (0-1)
   */
  calculateItemScore(item, type) {
    // Base score is whether the evidence was detected
    if (!item.detected) return 0;
    
    // Different calculation logic based on evidence type
    switch(type) {
      case 'objectPresence':
        // Object presence is binary - it exists or it doesn't
        return 1.0;
        
      case 'objectUsage':
      case 'userActivity':
      case 'apiUsage':
        // These types include usage counts that should be compared to thresholds
        if (!item.details.count) return 0.5; // If detected but no count, give partial credit
        if (!item.details.threshold) return 1.0; // If no threshold defined, give full credit
        
        // Return score based on count vs threshold
        if (item.details.count >= item.details.threshold * 2) return 1.0;
        if (item.details.count >= item.details.threshold) return 0.75;
        return (item.details.count / item.details.threshold) * 0.5;
        
      case 'featureConfiguration':
        // Features get full credit if configured
        return 1.0;
        
      case 'codeReferences':
        // Code references score based on the number of pattern matches
        if (!item.details.matches) return 0.5;
        return Math.min(1.0, item.details.matches.length / 3);
        
      default:
        // Default is full credit for detected evidence
        return 1.0;
    }
  }
  
  /**
   * Apply time decay to reduce the value of older evidence
   * 
   * @param {number} score - Original score
   * @param {Date} timestamp - When the evidence was collected
   * @returns {number} - Decayed score
   */
  applyTimeDecay(score, timestamp) {
    if (!timestamp || !this.algorithmConfig.decayFactors) return score;
    
    const now = new Date();
    const itemDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    // Age in days
    const ageInDays = (now - itemDate) / (1000 * 60 * 60 * 24);
    
    const decayRate = this.algorithmConfig.decayFactors.rate || 0.01;
    const decayFactor = Math.max(0, 1 - (ageInDays * decayRate));
    
    return score * decayFactor;
  }
  
  /**
   * Categorize a score into a usage category
   * 
   * @param {number} score - Probability score (0-100) 
   * @returns {string} - Category (Active, Limited, Inactive, Not Used)
   */
  categorizeScore(score) {
    const thresholds = this.algorithmConfig.thresholds;
    
    if (score >= thresholds.active) return 'Active';
    if (score >= thresholds.limited) return 'Limited';
    if (score >= thresholds.inactive) return 'Inactive';
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

module.exports = ScoringEngine; 