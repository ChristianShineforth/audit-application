#!/usr/bin/env node

// Interactive URL pathname extractor
// Usage: node extract-urls.mjs

import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";
import readline from "readline";

const gunzip = promisify(zlib.gunzip);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user for input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Validate and normalize URL
function normalizeUrl(url) {
  if (!url) return null;
  
  // Remove whitespace
  url = url.trim();
  
  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  
  // Remove trailing slash
  url = url.replace(/\/+$/, "");
  
  try {
    new URL(url); // Validate URL
    return url;
  } catch (error) {
    return null;
  }
}

// Fetch data from URL with error handling
async function fetchBuf(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

async function fetchText(url) {
  const buf = await fetchBuf(url);
  return url.endsWith(".gz") ? (await gunzip(buf)).toString("utf8") : buf.toString("utf8");
}

// Extract URLs from XML sitemap
const extractLocs = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());

// Get sitemap URLs from robots.txt
async function getRobotsSitemaps(baseUrl) {
  const robotsUrl = `${baseUrl}/robots.txt`;
  let txt = "";
  
  try {
    console.log(`📄 Checking robots.txt at ${robotsUrl}...`);
    txt = await fetchText(robotsUrl);
  } catch (error) {
    console.log(`⚠️  Could not fetch robots.txt: ${error.message}`);
  }
  
  const lines = [...txt.matchAll(/^\s*sitemap:\s*(.+)\s*$/gmi)].map(m => m[1].trim());
  
  // Fallback to common sitemap locations if robots.txt has none
  const fallbackSitemaps = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap-index.xml`
  ];
  
  return lines.length ? lines : fallbackSitemaps;
}

// Collect all URLs from sitemaps
async function collectAllUrls(baseUrl) {
  console.log(`🔍 Collecting URLs from sitemaps for ${baseUrl}...`);
  
  const queue = await getRobotsSitemaps(baseUrl);
  const seenSitemaps = new Set();
  const urls = new Set();
  let processedCount = 0;

  while (queue.length) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    
    seenSitemaps.add(sitemapUrl);
    processedCount++;
    
    console.log(`📋 Processing sitemap ${processedCount}: ${sitemapUrl}`);

    let xml;
    try {
      xml = await fetchText(sitemapUrl);
    } catch (error) {
      console.warn(`⚠️  Skipping bad sitemap: ${sitemapUrl} - ${error.message}`);
      continue;
    }

    // Check if it's a sitemap index (contains other sitemaps)
    if (/<sitemapindex\b/i.test(xml)) {
      const childSitemaps = extractLocs(xml);
      console.log(`  📂 Found ${childSitemaps.length} child sitemaps`);
      childSitemaps.forEach(child => queue.push(child));
    } else {
      // Regular sitemap with URLs
      const sitemapUrls = extractLocs(xml);
      console.log(`  🔗 Found ${sitemapUrls.length} URLs`);
      sitemapUrls.forEach(url => urls.add(url));
    }
  }

  return [...urls].sort();
}

// Extract pathnames from URLs
function extractPathnames(urls, baseUrl) {
  const host = new URL(baseUrl).host;
  
  return [...new Set(
    urls
      .filter(url => {
        try {
          return new URL(url).host === host;
        } catch {
          return false;
        }
      })
      .map(url => {
        try {
          return new URL(url).pathname || "/";
        } catch {
          return "/";
        }
      })
  )].sort();
}

// Main function
async function main() {
  console.log("🌐 URL Pathname Extractor");
  console.log("========================\n");

  try {
    // Get website URL from user
    let websiteUrl;
    while (!websiteUrl) {
      const input = await askQuestion("Enter website URL (e.g., example.com or https://example.com): ");
      websiteUrl = normalizeUrl(input);
      
      if (!websiteUrl) {
        console.log("❌ Invalid URL. Please try again.\n");
      }
    }

    console.log(`\n✅ Processing: ${websiteUrl}\n`);

    // Collect URLs from sitemaps
    const urls = await collectAllUrls(websiteUrl);
    
    if (urls.length === 0) {
      console.log("❌ No URLs found in sitemaps. The website might not have sitemaps or they might be inaccessible.");
      rl.close();
      return;
    }

    // Extract pathnames
    const pathnames = extractPathnames(urls, websiteUrl);

    // Save to url.txt
    await fs.writeFile("url.txt", pathnames.join("\n"), "utf8");

    console.log(`\n✅ Success!`);
    console.log(`📊 Found ${urls.length} total URLs`);
    console.log(`🛤️  Extracted ${pathnames.length} unique pathnames`);
    console.log(`💾 Saved pathnames to url.txt`);
    
    // Show first few pathnames as preview
    if (pathnames.length > 0) {
      console.log(`\n📋 Preview of first 10 pathnames:`);
      pathnames.slice(0, 10).forEach((path, index) => {
        console.log(`  ${index + 1}. ${path}`);
      });
      
      if (pathnames.length > 10) {
        console.log(`  ... and ${pathnames.length - 10} more`);
      }
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the script
main().catch(console.error);
