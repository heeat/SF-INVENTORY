/**
 * Model representing the result of an analysis for a specific product
 */
class AnalysisResult {
  /**
   * Create a new analysis result
   * 
   * @param {string} productName - The name of the product that was analyzed
   * @param {number} probabilityScore - Score indicating likelihood of product usage (0-100)
   * @param {string} category - Usage category (Active, Limited, Inactive, Not Used)
   * @param {string} edition - Detected product edition
   * @param {Object} evidenceSummary - Summary of evidence that led to this result
   * @param {Array} significantFindings - Key findings from the analysis
   * @param {Array} recommendations - Not used, kept for backwards compatibility
   */
  constructor(productName, probabilityScore, category, edition, evidenceSummary, significantFindings = [], recommendations = []) {
    this.productName = productName;
    this.probabilityScore = probabilityScore;
    this.category = category;
    this.edition = edition;
    this.evidenceSummary = evidenceSummary;
    this.significantFindings = significantFindings;
    // Recommendations parameter kept for backwards compatibility but not used
    this.recommendations = [];
    this.timestamp = new Date();
  }
  
  /**
   * Get a simple text description of the result
   * 
   * @returns {string} - Human-readable description
   */
  getDescription() {
    return `${this.productName} is ${this.category.toLowerCase()} (${Math.round(this.probabilityScore)}% probability) with likely ${this.edition} edition.`;
  }
  
  /**
   * Convert the result to a plain object for serialization
   * 
   * @returns {Object} - Plain object representing this result
   */
  toJSON() {
    return {
      product: this.productName,
      score: this.probabilityScore,
      category: this.category,
      edition: this.edition,
      summary: this.evidenceSummary,
      findings: this.significantFindings,
      analyzedAt: this.timestamp
    };
  }
}

module.exports = AnalysisResult; 