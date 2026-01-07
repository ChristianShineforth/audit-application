#!/usr/bin/env node

// Web crawler to discover URL pathnames by following links
// Usage: node crawl-urls.mjs

import fs from "fs/promises";
import readline from "readline";

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
function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  
  try {
    // If it's already a full URL, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return new URL(url).href;
    }
    
    // If it starts with //, add the protocol from baseUrl
    if (url.startsWith('//')) {
      return new URL(baseUrl.protocol + url).href;
    }
    
    // If it starts with /, it's an absolute path
    if (url.startsWith('/')) {
      return new URL(url, baseUrl.origin).href;
    }
    
    // Otherwise, it's a relative path
    return new URL(url, baseUrl.href).href;
  } catch (error) {
    return null;
  }
}

// Check if URL belongs to the same domain
function isSameDomain(url, baseUrl) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === baseUrl.hostname;
  } catch {
    return false;
  }
}

// Extract URLs from HTML content
function extractUrls(html, baseUrl) {
  const urls = new Set();
  
  // Extract href attributes from <a> tags
  const hrefMatches = [...html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  hrefMatches.forEach(match => {
    const url = normalizeUrl(match[1], baseUrl);
    if (url && isSameDomain(url, baseUrl) && isValidUrl(url)) {
      urls.add(url);
    }
  });
  
  // Extract src attributes from <img> tags
  const srcMatches = [...html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  srcMatches.forEach(match => {
    const url = normalizeUrl(match[1], baseUrl);
    if (url && isSameDomain(url, baseUrl) && isValidUrl(url)) {
      urls.add(url);
    }
  });
  
  // Extract action attributes from <form> tags
  const actionMatches = [...html.matchAll(/<form[^>]+action\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  actionMatches.forEach(match => {
    const url = normalizeUrl(match[1], baseUrl);
    if (url && isSameDomain(url, baseUrl) && isValidUrl(url)) {
      urls.add(url);
    }
  });
  
  // Extract URLs from JavaScript (more specific patterns)
  const jsMatches = [...html.matchAll(/["']([^"']*\/[^"']*\.(html|php|asp|jsp|htm|aspx))["']/gi)];
  jsMatches.forEach(match => {
    const url = normalizeUrl(match[1], baseUrl);
    if (url && isSameDomain(url, baseUrl) && isValidUrl(url)) {
      urls.add(url);
    }
  });
  
  // Extract URLs from data attributes
  const dataMatches = [...html.matchAll(/data-[^=]*\s*=\s*["']([^"']*\/[^"']*)["']/gi)];
  dataMatches.forEach(match => {
    const url = normalizeUrl(match[1], baseUrl);
    if (url && isSameDomain(url, baseUrl) && isValidUrl(url)) {
      urls.add(url);
    }
  });
  
  return [...urls];
}

// Validate if URL looks like a real URL path
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Skip URLs that contain HTML entities or look like HTML content
    if (pathname.includes('%3E') || pathname.includes('%3C') || pathname.includes('%20')) {
      return false;
    }
    
    // Skip URLs that contain HTML tags
    if (pathname.includes('<') || pathname.includes('>')) {
      return false;
    }
    
    // Skip URLs that are just HTML content
    if (pathname.match(/^\/[^\/]*[<>]/)) {
      return false;
    }
    
    // Skip URLs that contain JavaScript or CSS content
    if (pathname.includes('class=') || pathname.includes('id=') || pathname.includes('style=')) {
      return false;
    }
    
    // Skip URLs that are too long (likely HTML content)
    if (pathname.length > 200) {
      return false;
    }
    
    // Skip URLs that contain multiple consecutive special characters
    if (pathname.match(/[%]{2,}/)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Fetch page content with error handling
async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; URL-Crawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Not HTML content: ${contentType}`);
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

// Crawl website and discover URLs
async function crawlWebsite(startUrl, maxPages = 100, maxDepth = 3) {
  const baseUrl = new URL(startUrl);
  const visited = new Set();
  const toVisit = new Set([startUrl]);
  const discoveredUrls = new Set();
  const errors = [];
  
  let pagesProcessed = 0;
  let currentDepth = 0;
  
  console.log(`🕷️  Starting crawl of ${startUrl}`);
  console.log(`📊 Max pages: ${maxPages}, Max depth: ${maxDepth}\n`);
  
  while (toVisit.size > 0 && pagesProcessed < maxPages) {
    const currentBatch = Array.from(toVisit).slice(0, 10); // Process in batches of 10
    currentBatch.forEach(url => toVisit.delete(url));
    
    const promises = currentBatch.map(async (url) => {
      if (visited.has(url)) return;
      
      visited.add(url);
      pagesProcessed++;
      
      console.log(`📄 [${pagesProcessed}/${maxPages}] Crawling: ${url}`);
      
      try {
        const html = await fetchPage(url);
        const foundUrls = extractUrls(html, baseUrl);
        
        console.log(`  🔗 Found ${foundUrls.length} URLs`);
        
        foundUrls.forEach(foundUrl => {
          discoveredUrls.add(foundUrl);
          
          // Add new URLs to visit queue if we haven't reached max depth
          const urlDepth = (url.match(/\//g) || []).length - 2; // Rough depth calculation
          if (urlDepth < maxDepth && !visited.has(foundUrl)) {
            toVisit.add(foundUrl);
          }
        });
        
        // Add a small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        errors.push({ url, error: error.message });
      }
    });
    
    await Promise.all(promises);
    
    console.log(`📈 Progress: ${discoveredUrls.size} URLs discovered, ${toVisit.size} remaining\n`);
  }
  
  return {
    urls: [...discoveredUrls].sort(),
    errors,
    pagesProcessed,
    totalDiscovered: discoveredUrls.size
  };
}

// Extract pathnames from URLs
function extractPathnames(urls, baseUrl) {
  const host = baseUrl.hostname;
  
  return [...new Set(
    urls
      .filter(url => {
        try {
          return new URL(url).hostname === host;
        } catch {
          return false;
        }
      })
      .map(url => {
        try {
          const pathname = new URL(url).pathname || "/";
          return cleanPathname(pathname);
        } catch {
          return "/";
        }
      })
      .filter(pathname => isValidPathname(pathname))
  )].sort();
}

// Clean and validate pathname
function cleanPathname(pathname) {
  // Decode URL-encoded characters
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // If decoding fails, keep original
  }
  
  // Remove query parameters and fragments
  pathname = pathname.split('?')[0].split('#')[0];
  
  // Ensure it starts with /
  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }
  
  return pathname;
}

// Validate if pathname looks like a real URL path
function isValidPathname(pathname) {
  // Skip empty or invalid pathnames
  if (!pathname || pathname === '/') {
    return true; // Keep root path
  }
  
  // Skip pathnames that contain HTML entities
  if (pathname.includes('%3E') || pathname.includes('%3C') || pathname.includes('%20')) {
    return false;
  }
  
  // Skip pathnames that contain HTML tags
  if (pathname.includes('<') || pathname.includes('>')) {
    return false;
  }
  
  // Skip pathnames that are just HTML content
  if (pathname.match(/^\/[^\/]*[<>]/)) {
    return false;
  }
  
  // Skip pathnames that contain JavaScript or CSS content
  if (pathname.includes('class=') || pathname.includes('id=') || pathname.includes('style=')) {
    return false;
  }
  
  // Skip pathnames that are too long (likely HTML content)
  if (pathname.length > 200) {
    return false;
  }
  
  // Skip pathnames that contain multiple consecutive special characters
  if (pathname.match(/[%]{2,}/)) {
    return false;
  }
  
  // Skip pathnames that look like HTML attributes
  if (pathname.match(/^\/[^\/]*=/) || pathname.match(/^\/[^\/]*\s/)) {
    return false;
  }
  
  return true;
}

// Main function
async function main() {
  console.log("🕷️  Web Crawler - URL Pathname Discovery");
  console.log("==========================================\n");

  try {
    // Get website URL from user
    let websiteUrl;
    while (!websiteUrl) {
      const input = await askQuestion("Enter website URL (e.g., example.com or https://example.com): ");
      websiteUrl = input.trim();
      
      if (!websiteUrl) {
        console.log("❌ Please enter a valid URL.\n");
        continue;
      }
      
      // Add protocol if missing
      if (!/^https?:\/\//i.test(websiteUrl)) {
        websiteUrl = "https://" + websiteUrl;
      }
      
      try {
        new URL(websiteUrl); // Validate URL
      } catch {
        console.log("❌ Invalid URL format. Please try again.\n");
        websiteUrl = null;
      }
    }

    // Get crawling parameters
    const maxPagesInput = await askQuestion("Max pages to crawl (default: 50): ");
    const maxPages = maxPagesInput.trim() ? parseInt(maxPagesInput) : 50;
    
    const maxDepthInput = await askQuestion("Max crawl depth (default: 2): ");
    const maxDepth = maxDepthInput.trim() ? parseInt(maxDepthInput) : 2;

    console.log(`\n✅ Starting crawl of: ${websiteUrl}`);
    console.log(`📊 Max pages: ${maxPages}, Max depth: ${maxDepth}\n`);

    // Start crawling
    const result = await crawlWebsite(websiteUrl, maxPages, maxDepth);

    if (result.urls.length === 0) {
      console.log("❌ No URLs discovered. The website might be inaccessible or have no crawlable content.");
      if (result.errors.length > 0) {
        console.log("\nErrors encountered:");
        result.errors.forEach(({ url, error }) => {
          console.log(`  - ${url}: ${error}`);
        });
      }
      rl.close();
      return;
    }

    // Extract pathnames
    const baseUrl = new URL(websiteUrl);
    const pathnames = extractPathnames(result.urls, baseUrl);

    // Save to url.txt
    await fs.writeFile("url.txt", pathnames.join("\n"), "utf8");

    console.log(`\n✅ Crawl Complete!`);
    console.log(`📊 Pages processed: ${result.pagesProcessed}`);
    console.log(`🔗 URLs discovered: ${result.totalDiscovered}`);
    console.log(`🛤️  Unique pathnames: ${pathnames.length}`);
    console.log(`💾 Saved pathnames to url.txt`);
    
    if (result.errors.length > 0) {
      console.log(`⚠️  Errors encountered: ${result.errors.length}`);
    }
    
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
