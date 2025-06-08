import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

/**
 * Generate an Excel report for feature analysis results
 * @param {Object} results - Analysis results
 * @returns {Promise<Buffer>} - Excel file buffer
 */
async function generateExcelReport(results) {
  console.log('\n=== Excel Report Generation Debug ===');
  
  // Load config files
  const configPath = path.join(process.cwd(), 'config', 'analyzer-config.json');
  const analyzerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const workbook = new ExcelJS.Workbook();
  
  // Map product keys to config keys
  const productKeyMap = {
    'experience-cloud': 'experienceCloud',
    'sales-cloud': 'salesCloud',
    'service-cloud': 'serviceCloud'
  };
  
  // For each product in results
  for (const [productKey, productData] of Object.entries(results)) {
    console.log(`\nProcessing product: ${productKey}`);
    
    // Get product info from config using mapped key
    const configKey = productKeyMap[productKey];
    const productConfig = analyzerConfig.products[configKey];
    const productConfigPath = path.join(process.cwd(), 'config', 'products', productConfig.configFile);
    const productDetails = JSON.parse(fs.readFileSync(productConfigPath, 'utf8'));
    
    // Create worksheet
    const worksheet = workbook.addWorksheet(productKey);
    
    // Define columns
    worksheet.columns = [
      { header: 'Feature', key: 'feature', width: 35 },
      { header: 'Product', key: 'product', width: 25 },
      { header: 'Product Family', key: 'productFamily', width: 25 },
      { header: 'Implementation Status', key: 'status', width: 20 },
      { header: 'Description', key: 'description', width: 60 }
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4B88E0' }
    };
    headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    
    // Add data rows
    if (productData && productData.implementationStatus) {
      console.log(`Found ${productData.implementationStatus.length} features for ${productKey}`);
      
      productData.implementationStatus.forEach((item, index) => {
        console.log(`Processing item ${index + 1}:`, item.name);
        
        // Find feature details from config
        const featureDetails = findFeatureInConfig(item.name, productDetails);
        
        const row = worksheet.addRow({
          feature: item.name || '',
          product: featureDetails?.product || '',
          productFamily: featureDetails?.productFamily || '',
          status: item.detected ? 'Detected' : 'Not Detected',
          description: featureDetails ? featureDetails.description : ''
        });

        // Style the status cell
        const statusCell = row.getCell('status');
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: item.detected ? 'FF92C353' : 'FFE57373' }
        };

        // Style all cells in the row
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
    }

    // Auto-filter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: worksheet.rowCount, column: worksheet.columnCount }
    };
  }

  // Generate buffer
  console.log('\nGenerating Excel buffer...');
  return await workbook.xlsx.writeBuffer();
}

/**
 * Find feature details in product config
 * @param {string} featureName - Name of the feature to find
 * @param {Object} productConfig - Product configuration object
 * @returns {Object|null} - Feature details if found
 */
function findFeatureInConfig(featureName, productConfig) {
  for (const category of productConfig.indicators || []) {
    for (const item of category.items || []) {
      if (item.name === featureName) {
        return {
          ...item,
          category: category.category,
          categoryDescription: category.description
        };
      }
    }
  }
  return null;
}

export { generateExcelReport }; 