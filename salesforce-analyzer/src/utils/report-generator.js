/**
 * Report Generator
 * 
 * Utilities for generating reports from analysis results
 */

/**
 * Generate a summary report of all product analysis results
 * 
 * @param {Object} results - Analysis results for all products
 * @returns {Object} - Formatted report
 */
function generateSummaryReport(results) {
  const products = Object.values(results);
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalProducts: products.length,
      active: products.filter(p => p.category === 'Active').length,
      limited: products.filter(p => p.category === 'Limited').length,
      inactive: products.filter(p => p.category === 'Inactive').length
    },
    products: products.map(product => ({
      name: product.productName,
      score: Math.round(product.probabilityScore),
      category: product.category,
      edition: product.edition
    }))
  };
  
  return report;
}

/**
 * Generate a detailed report for a specific product
 * 
 * @param {AnalysisResult} result - Analysis result for a product
 * @returns {Object} - Formatted detailed report
 */
function generateDetailedReport(result) {
  const report = {
    product: result.productName,
    score: Math.round(result.probabilityScore),
    category: result.category,
    edition: result.edition,
    timestamp: result.timestamp.toISOString(),
    summary: `${result.productName} is ${result.category.toLowerCase()} with a ${Math.round(result.probabilityScore)}% probability score`,
    findings: result.significantFindings,
    evidence: {}
  };
  
  // Format evidence by category
  Object.entries(result.evidenceSummary.byCategory).forEach(([category, items]) => {
    report.evidence[category] = items.map(item => ({
      name: item.name,
      details: summarizeItemDetails(item.details)
    }));
  });
  
  return report;
}

/**
 * Generate a human-readable text report
 * 
 * @param {AnalysisResult} result - Analysis result for a product
 * @returns {string} - Text report
 */
function generateTextReport(result) {
  let report = `
=======================================================
  SALESFORCE PRODUCT ANALYSIS: ${result.productName.toUpperCase()}
=======================================================

SUMMARY
-------
${result.productName} is ${result.category.toLowerCase()} (${Math.round(result.probabilityScore)}% probability)
Edition: ${result.edition}
Analyzed: ${result.timestamp.toLocaleString()}

KEY FINDINGS
-----------
${result.significantFindings.map(f => `- ${f}`).join('\n')}

EVIDENCE SUMMARY
--------------
Total indicators analyzed: ${result.evidenceSummary.totalItems}
Detected indicators: ${result.evidenceSummary.detectedItems}
`;

  // Add evidence by category
  Object.entries(result.evidenceSummary.byCategory).forEach(([category, items]) => {
    if (items.length === 0) return;
    
    report += `\n${category}:\n`;
    items.forEach(item => {
      report += `- ${item.name}\n`;
    });
  });

  return report;
}

/**
 * Generate a CSV report of all product results
 * 
 * @param {Object} results - Analysis results for all products
 * @returns {string} - CSV content
 */
function generateCsvReport(results) {
  const products = Object.values(results);
  
  let csv = 'Product,Score,Category,Edition\n';
  
  products.forEach(product => {
    csv += `"${product.productName}",${Math.round(product.probabilityScore)},"${product.category}","${product.edition}"\n`;
  });
  
  return csv;
}

/**
 * Helper to summarize item details for reports
 * 
 * @param {Object} details - Raw item details
 * @returns {Object} - Summarized details
 */
function summarizeItemDetails(details) {
  if (!details) return {};
  
  // Extract the most relevant information
  const summary = {};
  
  if (details.recordCount !== undefined) {
    summary.recordCount = details.recordCount;
  }
  
  if (details.lastModified) {
    summary.lastModified = details.lastModified;
  }
  
  if (details.usage) {
    summary.usage = details.usage;
  }
  
  if (details.count !== undefined) {
    summary.count = details.count;
  }
  
  if (details.matches) {
    summary.matches = details.matches;
  }
  
  // Remove potentially large or sensitive data
  return summary;
}

module.exports = {
  generateSummaryReport,
  generateDetailedReport,
  generateTextReport,
  generateCsvReport
}; 