import fs from 'fs';
import fetch from 'node-fetch'; // use version 2
import csv from 'csv-parser';   // for parsing the CSV
import { stringify } from 'csv-stringify/sync'; 

const redirects = [];
const failedRedirects = [];
const baseUrl="https://www.condo-world.com";

fs.createReadStream('./condo-world-redirect-sheet.csv')
  .pipe(csv())
  .on('data', (row) => {
    redirects.push({ from: row.old, to: row.new });
  })
  .on('end', async () => {
    console.log(`🔍 Auditing ${redirects.length} redirects...\n`);
    await auditRedirects();
    writeFailuresToCSV();
  });

function writeFailuresToCSV() {
  const output = stringify(failedRedirects, {
    header: true,
    columns: { from: 'From URL', expected: 'Expected Redirect', actual: 'Actual Redirect', status: 'Status' }
  });

  fs.writeFileSync('failed-redirects.csv', output);
  console.log(`📁 Saved ${failedRedirects.length} failed redirects to failed-redirects.csv`);
}

async function checkRedirect(fromUrl, expectedToUrl) {
  try {
    const response = await fetch(
      (baseUrl + fromUrl),
      {
        redirect: 'manual',
      },
    );
    const location = response.headers.get('location');
    const status = response.status;

    if (status === 301 || status === 302 || status === 308 || status === 307 ) {
      const followResponse = await fetch((baseUrl + fromUrl), {
        redirect: 'follow',
      });
      const followLocation = followResponse.url;
      const followStatus = followResponse.status;

      if (followLocation === (baseUrl + expectedToUrl) || followStatus === 200) {
        console.log(`✅ ${(baseUrl + fromUrl)} correctly redirects to ${followLocation}`);
      } else {
        console.log(`❌ ${(baseUrl + fromUrl)} failed to redirect, expected ${baseUrl + expectedToUrl} but it redirected to ${followLocation} with status ${followStatus}`);
        failedRedirects.push({ from: fromUrl, expected: expectedToUrl, actual: followLocation, status:followStatus });
      }
    } else if (status === 200) {
      console.warn(`✅ ${(baseUrl + fromUrl)} did not redirect (Status: ${status})`);
    } else {
      console.warn(`❌ ${(baseUrl + fromUrl)} did not redirect (Status: ${status})`);
      failedRedirects.push({ from: fromUrl, expected: expectedToUrl, actual: '', status });
    }
  } catch (err) {
    console.error(`🔥 Error checking ${(baseUrl + fromUrl)}: ${err.message}`);
    failedRedirects.push({ from: fromUrl, expected: expectedToUrl, actual: `Error: ${err.message}`, status: 'Error' });
  }
}

async function auditRedirects() {
  for (const { from, to } of redirects) {
    await checkRedirect(from, to);
  }
}
