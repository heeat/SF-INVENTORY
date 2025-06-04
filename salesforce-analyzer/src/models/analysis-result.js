/**
 * Model representing the result of an analysis for a specific product
 */
class AnalysisResult {
  /**
   * Create a new analysis result
   * 
   * @param {string} productName - The name of the product that was analyzed
   * @param {Object} implementationStatus - Status of feature implementation
   * @param {string} edition - Detected product edition
   * @param {Object} evidenceSummary - Summary of evidence that led to this result
   * @param {Array} significantFindings - Key findings from the analysis
   */
  constructor(productName, implementationStatus, edition, evidenceSummary, significantFindings = []) {
    this.productName = productName;
    this.implementationStatus = implementationStatus;
    this.edition = edition;
    this.evidenceSummary = evidenceSummary;
    this.significantFindings = significantFindings;
    this.timestamp = new Date();
  }
  
  /**
   * Get a simple text description of the result
   * 
   * @returns {string} - Human-readable description
   */
  getDescription() {
    const implemented = this.implementationStatus.implemented.length;
    const notImplemented = this.implementationStatus.notImplemented.length;
    return `${this.productName} has ${implemented} implemented features and ${notImplemented} not implemented features (${this.edition} edition).`;
  }
  
  /**
   * Convert the result to a plain object for serialization
   * 
   * @returns {Object} - Plain object representing this result
   */
  toJSON() {
    return {
      product: this.productName,
      implementationStatus: this.implementationStatus,
      edition: this.edition,
      summary: this.evidenceSummary,
      findings: this.significantFindings,
      analyzedAt: this.timestamp
    };
  }
}

module.exports = AnalysisResult; 