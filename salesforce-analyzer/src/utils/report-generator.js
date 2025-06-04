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
    implementationStatus: {
      implemented: result.implementationStatus.implemented.length,
      notImplemented: result.implementationStatus.notImplemented.length,
      implementedFeatures: result.implementationStatus.implemented.map(f => f.name),
      notImplementedFeatures: result.implementationStatus.notImplemented.map(f => f.name)
    },
    edition: result.edition,
    timestamp: result.timestamp.toISOString(),
    summary: `${result.productName} has ${result.implementationStatus.implemented.length} implemented features and ${result.implementationStatus.notImplemented.length} not implemented features`,
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
${result.productName} Implementation Status:
- Implemented Features: ${result.implementationStatus.implemented.length}
- Not Implemented Features: ${result.implementationStatus.notImplemented.length}
Edition: ${result.edition}
Analyzed: ${result.timestamp.toLocaleString()}

IMPLEMENTED FEATURES
------------------
${result.implementationStatus.implemented.map(f => `- ${f.name}`).join('\n')}

NOT IMPLEMENTED FEATURES
----------------------
${result.implementationStatus.notImplemented.map(f => `- ${f.name}`).join('\n')}

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
 * Summarize the details of an evidence item
 * 
 * @param {Object} details - Evidence details
 * @returns {string} - Summarized details
 */
function summarizeItemDetails(details) {
  if (!details) return '';
  
  const summary = [];
  
  if (details.count !== undefined) {
    summary.push(`Count: ${details.count}`);
  }
  
  if (details.matches) {
    summary.push(`Matches: ${details.matches.length}`);
  }
  
  if (details.lastModified) {
    summary.push(`Last Modified: ${new Date(details.lastModified).toLocaleDateString()}`);
  }
  
  return summary.join(', ');
}

module.exports = {
  generateSummaryReport,
  generateDetailedReport,
  generateTextReport,
  generateCsvReport
}; 