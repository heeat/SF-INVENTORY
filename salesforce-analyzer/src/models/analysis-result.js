/**
 * Model representing the result of an analysis for a specific product
 */
class AnalysisResult {
  /**
   * Create a new analysis result
   * 
   * @param {string} productName - The name of the product that was analyzed
   * @param {string} category - Usage category (Active, Limited, Minimal, Not Used)
   * @param {string} edition - Detected product edition
   * @param {Object} evidenceSummary - Summary of evidence that led to this result
   * @param {Array} significantFindings - Key findings from the analysis
   */
  constructor(productName, category, edition, evidenceSummary, significantFindings = []) {
    this.productName = productName;
    this.category = category;
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
    return `${this.productName} usage is ${this.category.toLowerCase()} with likely ${this.edition} edition.`;
  }
  
  /**
   * Convert the result to a plain object for serialization
   * 
   * @returns {Object} - Plain object representing this result
   */
  toJSON() {
    return {
      product: this.productName,
      category: this.category,
      edition: this.edition,
      summary: this.evidenceSummary,
      findings: this.significantFindings,
      analyzedAt: this.timestamp
    };
  }
}

module.exports = AnalysisResult; 