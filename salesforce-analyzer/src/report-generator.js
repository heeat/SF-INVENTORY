/**
 * Report Generator
 * Generates readable reports from analyzer results
 */

/**
 * Generate a usage report from analysis results
 * @param {Object} results Analysis results
 * @returns {string} Formatted report
 */
function generateUsageReport(results) {
  const { summary, indicatorResults } = results;
  let report = `\n=== ${results.product} USAGE REPORT ===\n\n`;

  // Summary section
  report += `Features Detected: ${summary.detectedItems}/${summary.totalItems}\n`;
  report += `Features Actively Used: ${summary.activeItems}/${summary.totalItems}\n\n`;

  // Category breakdown
  report += 'CATEGORY BREAKDOWN\n';
  report += '------------------\n';
  for (const category of indicatorResults) {
    const totalItems = category.items.length;
    const detectedItems = category.items.filter(item => item.detected).length;
    const activeItems = category.items.filter(item => item.active).length;
    
    report += `${category.category}: ${activeItems}/${totalItems} features active\n`;
  }
  report += '\n';

  // Active features
  report += 'ACTIVELY USED FEATURES\n';
  report += '-----------------------\n';
  let hasActiveFeatures = false;
  for (const category of indicatorResults) {
    const activeFeatures = category.items.filter(item => item.detected && item.active);
    if (activeFeatures.length > 0) {
      hasActiveFeatures = true;
      for (const feature of activeFeatures) {
        report += `✅ ${category.category} - ${feature.name}\n`;
        if (feature.details) {
          if (feature.details.message) {
            report += `   ${feature.details.message}\n`;
          }
          if (feature.details.recordCount !== undefined) {
            report += `   Records: ${feature.details.recordCount}`;
            if (feature.details.usage && feature.details.usage.count !== undefined) {
              report += `, Recent activity: ${feature.details.usage.count} records in last 30 days`;
            }
            if (feature.details.customFields !== undefined) {
              report += `, Custom fields: ${feature.details.customFields}`;
            }
            report += '\n';
          }
        }
      }
    }
  }
  if (!hasActiveFeatures) {
    report += 'No features are being actively used.\n';
  }
  report += '\n';

  // Available but unused features
  report += 'AVAILABLE BUT UNUSED FEATURES\n';
  report += '-----------------------------\n';
  let hasUnusedFeatures = false;
  for (const category of indicatorResults) {
    const unusedFeatures = category.items.filter(item => item.detected && !item.active);
    if (unusedFeatures.length > 0) {
      hasUnusedFeatures = true;
      for (const feature of unusedFeatures) {
        report += `⚠️ ${category.category} - ${feature.name}\n`;
        if (feature.details) {
          if (feature.details.message) {
            report += `   ${feature.details.message}\n`;
          }
          if (feature.details.recordCount !== undefined) {
            report += `   Records: ${feature.details.recordCount}`;
            if (feature.details.usage && feature.details.usage.count !== undefined) {
              report += `, Recent activity: ${feature.details.usage.count} records in last 30 days`;
            }
            if (feature.details.customFields !== undefined) {
              report += `, Custom fields: ${feature.details.customFields}`;
            }
            report += '\n';
          }
        }
      }
    }
  }
  if (!hasUnusedFeatures) {
    report += 'No available but unused features.\n';
  }
  report += '\n';

  // Unavailable features
  report += 'UNAVAILABLE FEATURES\n';
  report += '-------------------\n';
  let hasUnavailableFeatures = false;
  for (const category of indicatorResults) {
    const unavailableFeatures = category.items.filter(item => !item.detected);
    if (unavailableFeatures.length > 0) {
      hasUnavailableFeatures = true;
      for (const feature of unavailableFeatures) {
        report += `❌ ${category.category} - ${feature.name}\n`;
        report += `   Reason: ${feature.details?.error || 'Not available or not detected'}\n`;
      }
    }
  }
  if (!hasUnavailableFeatures) {
    report += 'No unavailable features.\n';
  }
  report += '\n';

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
  generateUsageReport
}; 