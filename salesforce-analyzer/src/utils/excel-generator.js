const ExcelJS = require('exceljs');

/**
 * Generate an Excel report for Experience Cloud features
 * @param {Object} results - Analysis results
 * @returns {Promise<Buffer>} - Excel file buffer
 */
async function generateExcelReport(results) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Experience Cloud Features');

  // Define columns
  worksheet.columns = [
    { header: 'Feature', key: 'feature', width: 30 },
    { header: 'Feature Category', key: 'category', width: 20 },
    { header: 'Product Family', key: 'productFamily', width: 20 },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Last Activity', key: 'lastActivity', width: 25 },
    { header: 'Description', key: 'description', width: 50 }
  ];

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4B88E0' }  // Salesforce blue
  };
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

  // Process each category and its items
  let rowNum = 2;
  for (const category of results.indicatorResults) {
    for (const item of category.items) {
      const row = worksheet.getRow(rowNum);
      
      // Add data
      row.getCell('feature').value = item.name;
      row.getCell('category').value = category.category;
      row.getCell('productFamily').value = 'Experience Cloud';  // Since we're analyzing Experience Cloud
      row.getCell('product').value = getProductForFeature(item.name);
      
      // Set status and color
      const status = item.detected ? (item.active ? 'Active' : 'Detected') : 'Not Detected';
      row.getCell('status').value = status;
      row.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: item.active ? 'FF92C353' : (item.detected ? 'FFFFD700' : 'FFE57373') }  // Green if active, yellow if detected, red if not detected
      };

      // Add last activity
      let lastActivity = 'N/A';
      if (item.detected && item.details) {
        if (item.details.usage && item.details.usage.recentDate) {
          lastActivity = item.details.usage.recentDate;
        } else if (item.details.lastActivity) {
          lastActivity = item.details.lastActivity;
        }
      }
      row.getCell('lastActivity').value = lastActivity;

      // Add description
      row.getCell('description').value = getFeatureDescription(item.name);

      rowNum++;
    }
  }

  // Add filters
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowNum - 1, column: 7 }
  };

  // Style all cells
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Get the product name for a specific feature
 * @param {string} featureName - Name of the feature
 * @returns {string} - Product name
 */
function getProductForFeature(featureName) {
  const productMap = {
    // Core Objects
    'Network': 'Experience Cloud Platform',
    'NetworkMember': 'Experience Cloud Platform',
    'ContentDocument': 'Content Management',
    'Topic': 'Content Management',
    'ManagedContent': 'CMS',
    
    // Features
    'Experience Builder': 'Experience Builder',
    'Branding Configuration': 'Experience Builder',
    'Mobile Publisher': 'Mobile Publisher',
    'CMS for Experience Cloud': 'CMS',
    'Multi-language Support': 'Experience Cloud Platform',
    'Self-Registration': 'Experience Cloud Platform',
    'Case Deflection': 'Service Integration',
    'Single Sign-On': 'Security',
    'Multi-factor Authentication': 'Security',
    
    // Developer Features
    'Integration with External Systems': 'APIs and Integration',
    
    // Mobile and App Features
    'Mobile Publisher Configuration': 'Mobile Publisher',
    
    // Content Management
    'Dynamic Content Delivery': 'CMS',
    
    // Security and Authentication
    'Single Sign-On Configuration': 'Security',
    'Custom Sharing Rules': 'Security',
    
    // Engagement Features
    'Gamification': 'Community Engagement',
    
    // Branding and Domain
    'Custom Domain Configuration': 'Experience Cloud Platform',
    'Custom Branding Theme': 'Experience Builder'
  };
  
  return productMap[featureName] || 'Experience Cloud Platform';
}

/**
 * Get the description for a specific feature
 * @param {string} featureName - Name of the feature
 * @returns {string} - Feature description
 */
function getFeatureDescription(featureName) {
  const descriptionMap = {
    // Core Objects
    'Network': 'Core object representing an Experience Cloud site',
    'NetworkMember': 'Represents members/users of the Experience Cloud site',
    'ContentDocument': 'Manages content and files shared in the Experience Cloud',
    'Topic': 'Organizes content and enables content discovery',
    'ManagedContent': 'CMS content types and items',
    
    // Features
    'Experience Builder': 'Drag-and-drop tool for building Experience Cloud sites',
    'Branding Configuration': 'Manages site appearance, themes, and styling',
    'Mobile Publisher': 'Creates branded mobile apps for Experience Cloud',
    'CMS for Experience Cloud': 'Content management system for digital experiences',
    'Multi-language Support': 'Enables multilingual site content and translation',
    'Self-Registration': 'Allows external users to self-register for the site',
    'Case Deflection': 'Suggests relevant articles to reduce case creation',
    'Single Sign-On': 'Enables SSO authentication for site users',
    'Multi-factor Authentication': 'Adds additional security layer for authentication',
    
    // Developer Features
    'Integration with External Systems': 'Connects Experience Cloud with external services',
    
    // Mobile and App Features
    'Mobile Publisher Configuration': 'Settings for branded mobile app deployment',
    
    // Content Management
    'Dynamic Content Delivery': 'Personalized content delivery based on user context',
    
    // Security and Authentication
    'Single Sign-On Configuration': 'SSO setup and provider configuration',
    'Custom Sharing Rules': 'Controls data visibility for external users',
    
    // Engagement Features
    'Gamification': 'Engagement features like reputation and badges',
    
    // Branding and Domain
    'Custom Domain Configuration': 'Custom URLs and domain settings',
    'Custom Branding Theme': 'Custom branding and theme configuration'
  };
  
  return descriptionMap[featureName] || 'No description available';
}

module.exports = {
  generateExcelReport
}; 