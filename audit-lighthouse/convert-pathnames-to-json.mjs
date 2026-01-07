#!/usr/bin/env node

// Convert pathnames.txt to JSON format
// Usage: node convert-pathnames-to-json.mjs [input-file] [output-file]

import fs from "fs/promises";
import path from "path";

async function convertPathnamesToJson(inputFile, outputFile) {
  try {
    console.log(`📄 Reading pathnames from: ${inputFile}`);
    
    // Read the pathnames file
    const content = await fs.readFile(inputFile, 'utf8');
    const pathnames = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0); // Remove empty lines
    
    console.log(`📊 Found ${pathnames.length} pathnames`);
    
    // Extract site name from filename or use default
    const siteName = path.basename(inputFile, '.txt').replace('-pathnames', '');
    
    // Create JSON structure
    const jsonData = {
      site: siteName,
      base: `https://www.${siteName}.com`, // You can modify this as needed
      pathnames: pathnames,
      metadata: {
        totalPathnames: pathnames.length,
        generatedAt: new Date().toISOString(),
        sourceFile: inputFile
      }
    };
    
    // Write JSON file
    await fs.writeFile(outputFile, JSON.stringify(jsonData, null, 2), 'utf8');
    
    console.log(`✅ Successfully converted to JSON format`);
    console.log(`💾 Saved to: ${outputFile}`);
    console.log(`📋 Preview of first 5 pathnames:`);
    pathnames.slice(0, 5).forEach((pathname, index) => {
      console.log(`  ${index + 1}. ${pathname}`);
    });
    
    if (pathnames.length > 5) {
      console.log(`  ... and ${pathnames.length - 5} more`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Get command line arguments
const inputFile = process.argv[2] || './sites-url-pathnames/mbgolf-pathnames.txt';
const outputFile = process.argv[3] || inputFile.replace('.txt', '.json');

// Run the conversion
convertPathnamesToJson(inputFile, outputFile);



