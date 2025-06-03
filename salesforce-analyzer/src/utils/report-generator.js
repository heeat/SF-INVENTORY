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
  
  // Group by product family
  const byFamily = {};
  products.forEach(product => {
    const family = product.productFamily || 'Other';
    if (!byFamily[family]) {
      byFamily[family] = [];
    }
    byFamily[family].push(product);
  });
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalProducts: products.length,
      byFamily: Object.fromEntries(
        Object.entries(byFamily).map(([family, prods]) => [
          family,
          {
            total: prods.length,
            active: prods.filter(p => p.category === 'Active').length,
            limited: prods.filter(p => p.category === 'Limited').length,
            minimal: prods.filter(p => p.category === 'Minimal').length,
            notUsed: prods.filter(p => p.category === 'Not Used').length
          }
        ])
      ),
      active: products.filter(p => p.category === 'Active').length,
      limited: products.filter(p => p.category === 'Limited').length,
      minimal: products.filter(p => p.category === 'Minimal').length,
      notUsed: products.filter(p => p.category === 'Not Used').length
    },
    products: products.map(product => ({
      name: product.productName,
      family: product.productFamily || 'Other',
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
    productFamily: result.productFamily || 'Other',
    category: result.category,
    edition: result.edition,
    timestamp: result.timestamp.toISOString(),
    summary: `${result.productName} usage is ${result.category.toLowerCase()} with likely ${result.edition} edition`,
    findings: result.significantFindings,
    evidence: {}
  };
  
  // Format evidence by category
  Object.entries(result.evidenceSummary.byCategory).forEach(([category, items]) => {
    report.evidence[category] = items.map(item => ({
      name: item.name,
      productFamily: item.productFamily || 'Other',
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
  let output = `
=======================================================
  SALESFORCE PRODUCT ANALYSIS: ${result.productName.toUpperCase()}
=======================================================

SUMMARY
-------
Product Family: ${result.productFamily || 'Other'}
${result.productName} usage is ${result.category.toLowerCase()}
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
    
    output += `\n${category}:\n`;
    items.forEach(item => {
      output += `- ${item.name} (${item.productFamily || 'Other'})\n`;
    });
  });

  return output;
}

/**
 * Generate a CSV report of all product results
 * 
 * @param {Object} results - Analysis results for all products
 * @returns {string} - CSV content
 */
function generateCsvReport(results) {
  const products = Object.values(results);
  
  let csv = 'Product,Product Family,Category,Edition,Detected Features,Total Features\n';
  
  products.forEach(product => {
    const detectedFeatures = product.evidenceSummary.detectedItems || 0;
    const totalFeatures = product.evidenceSummary.totalItems || 0;
    
    csv += `"${product.productName}","${product.productFamily || 'Other'}","${product.category}","${product.edition}",${detectedFeatures},${totalFeatures}\n`;
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

export {
  generateSummaryReport,
  generateDetailedReport,
  generateTextReport,
  generateCsvReport
}; 