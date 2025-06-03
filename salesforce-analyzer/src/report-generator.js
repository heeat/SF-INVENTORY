/**
 * Report Generator
 * Generates readable reports from analyzer results
 */

/**
 * Generate a feature usage report
 * @param {Object} results Analysis results from the analyzer
 * @returns {String} Formatted report
 */
function generateUsageReport(results) {
  const { product, indicatorResults, summary } = results;
  
  let report = `\n=== ${product} USAGE REPORT ===\n\n`;
  
  // Add summary statistics
  report += `Overall Usage Score: ${summary.overallScore}%\n`;
  report += `Features Detected: ${summary.detectedItems}/${summary.totalItems} (${summary.detectionScore}%)\n`;
  report += `Features Actively Used: ${summary.activeItems}/${summary.totalItems} (${summary.usageScore}%)\n\n`;
  
  // Calculate category-specific usage scores
  const categoryScores = calculateCategoryScores(indicatorResults);
  
  // Add category breakdown section
  report += "CATEGORY BREAKDOWN\n";
  report += "------------------\n";
  Object.values(categoryScores).forEach(category => {
    report += `${category.name}: ${category.usageRate}% utilized (${category.activeItems}/${category.totalItems} features)\n`;
  });
  report += "\n";
  
  // Create sections for used, available but unused, and unavailable features
  const used = [];
  const availableButUnused = [];
  const unavailable = [];
  
  // Process each category
  for (const category of indicatorResults) {
    const categoryName = category.category;
    
    // Process items in this category
    for (const item of category.items) {
      const itemName = item.name;
      const fullName = `${categoryName} - ${itemName}`;
      
      if (item.active) {
        // Feature is detected and actively used
        const details = formatDetails(item.details);
        used.push({ name: fullName, details });
      } else if (item.detected) {
        // Feature is detected but not actively used
        const details = formatDetails(item.details);
        availableButUnused.push({ name: fullName, details });
      } else {
        // Feature is not detected
        const reason = item.details && item.details.error 
          ? item.details.error
          : item.details && item.details.message
            ? item.details.message
            : "Not available or not detected";
        unavailable.push({ name: fullName, reason });
      }
    }
  }
  
  // Add used features section
  report += "ACTIVELY USED FEATURES\n";
  report += "-----------------------\n";
  if (used.length > 0) {
    used.forEach(item => {
      report += `✅ ${item.name}\n`;
      if (item.details) {
        report += `   ${item.details}\n`;
      }
    });
  } else {
    report += "No features are being actively used.\n";
  }
  report += "\n";
  
  // Add available but unused features section
  report += "AVAILABLE BUT UNUSED FEATURES\n";
  report += "-----------------------------\n";
  if (availableButUnused.length > 0) {
    availableButUnused.forEach(item => {
      report += `⚠️ ${item.name}\n`;
      if (item.details) {
        report += `   ${item.details}\n`;
      }
    });
  } else {
    report += "No features are available but unused.\n";
  }
  report += "\n";
  
  // Add unavailable features section
  report += "UNAVAILABLE FEATURES\n";
  report += "-------------------\n";
  if (unavailable.length > 0) {
    unavailable.forEach(item => {
      report += `❌ ${item.name}\n`;
      if (item.reason) {
        report += `   Reason: ${item.reason}\n`;
      }
    });
  } else {
    report += "All features are available.\n";
  }
  
  // Add explanation of cloud-specific integration detection
  report += "\n";
  report += addCloudSpecificIntegrationExplanation(product);
  
  return report;
}

/**
 * Calculate category-specific usage scores
 * @param {Array} indicatorResults - Analysis results by category
 * @returns {Object} - Category scores
 */
function calculateCategoryScores(indicatorResults) {
  const categoryScores = {};
  
  // Calculate scores for each category
  for (const category of indicatorResults) {
    const categoryName = category.category;
    const totalItems = category.items.length;
    const detectedItems = category.items.filter(item => item.detected).length;
    const activeItems = category.items.filter(item => item.active).length;
    
    categoryScores[categoryName] = {
      name: categoryName,
      totalItems,
      detectedItems,
      activeItems,
      detectionRate: Math.round((detectedItems / totalItems) * 100),
      usageRate: Math.round((activeItems / totalItems) * 100)
    };
  }
  
  return categoryScores;
}

/**
 * Format details for a more readable output
 * @param {Object} details Detail object from analysis
 * @returns {String} Formatted details string
 */
function formatDetails(details) {
  if (!details) return "";
  
  let result = "";
  
  // Handle record counts
  if (details.recordCount !== undefined) {
    result += `Records: ${details.recordCount}`;
  }
  
  // Handle usage details
  if (details.usage) {
    if (result) result += ", ";
    result += `Recent activity: ${details.usage.count} records in last 30 days`;
  }
  
  // Handle custom fields
  if (details.customFields !== undefined) {
    if (result) result += ", ";
    result += `Custom fields: ${details.customFields}`;
  }
  
  // Handle integration fields if present
  if (details.integrationFields && details.integrationFields.count > 0) {
    if (result) result += ", ";
    result += `Integration fields: ${details.integrationFields.count}`;
    
    const fieldDetails = details.integrationFields.items
      .map(item => `${item.object} (${item.fields.length})`)
      .join(", ");
    
    if (fieldDetails) {
      result += ` on ${fieldDetails}`;
    }
  }
  
  return result;
}

/**
 * Add explanation of how cloud-specific integrations are detected
 * @param {String} productName - Name of the product
 * @returns {String} - Explanation text
 */
function addCloudSpecificIntegrationExplanation(productName) {
  // Only add this for Service Cloud and Sales Cloud
  if (productName !== 'Service Cloud' && productName !== 'Sales Cloud') {
    return '';
  }
  
  let explanation = "NOTE ON INTEGRATION DETECTION:\n";
  explanation += "-----------------------------\n";
  explanation += `For ${productName}, we distinguish integrations through:\n\n`;
  
  // Integration fields on cloud-specific objects
  const objectsToCheck = productName === 'Service Cloud' 
    ? ['Case', 'Contact', 'Knowledge__kav']
    : ['Opportunity', 'Lead', 'Account', 'Contact'];
  
  explanation += `1. Integration-specific fields on ${productName} objects\n`;
  explanation += `   (${objectsToCheck.join(', ')})\n\n`;
  
  // API naming patterns
  const keywords = productName === 'Service Cloud'
    ? ['case', 'service', 'support', 'ticket', 'knowledge']
    : ['opportunity', 'lead', 'sales', 'pipeline', 'forecast'];
  
  explanation += `2. API configurations with ${productName}-specific keywords\n`;
  explanation += `   (${keywords.join(', ')})\n\n`;
  
  // User activity patterns
  explanation += `3. User activity patterns related to ${productName} objects\n\n`;
  
  return explanation;
}

module.exports = {
  generateUsageReport,
  calculateCategoryScores,
  formatDetails,
  addCloudSpecificIntegrationExplanation
}; 