import sys
import os
import argparse
import csv
import requests
import time
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from datetime import date
from pathlib import Path

CHECKS = []


def fetch(url, max_retries=3, base_delay=1.0):
    delay = base_delay

    for attempt in range(max_retries + 1):
        try:
            time.sleep(base_delay)

            r = requests.get(
                url,
                timeout=(5, 20),
                headers={'User-Agent': 'seo-audit-bot/1.0'},
                allow_redirects=True
            )

            if r.status_code in (429, 503) and attempt < max_retires:
                ra = r.headers.get("Retry-After")
                wait = delay

                if ra:
                    try:
                        wait = max(wait, float(ra))
                    except ValueError:
                        pass
                time.sleep(wait)
                delay = min(delay * 2, 16)
                continue

            return r.status_code, r.text
        
        except requests.RequestException:
            if attempt == max_retries:
                return None, None
            time.sleep(delay)
            delay = min(delay * 2, 16)
    
    return None, None




def extract_checks(soup, url, code):
    """
    Run each check and gather results in a dict.
    """
    results = {
        'URL': url,
        'HTTP Status': code,
    }

    # TITLE
    title = soup.title.string.strip() if soup.title and soup.title.string else ''
    results['TITLE'] = title

    # META DESCRIPTION
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    results['META-DESC'] = desc_tag.get('content', '').strip() if desc_tag else ''

    # H1 count
    results['H1 Count'] = len(soup.find_all('h1'))

    # IMG ALT
    imgs = soup.find_all('img')
    missing_alts = len([img for img in imgs if not img.get('alt')])
    results['IMG-ALT Missing'] = missing_alts
    results['IMG Total'] = len(imgs)

    # CANONICAL
    results['CANONICAL'] = 'yes' if soup.find('link', rel='canonical') else 'no'

    # Open Graph
    for tag in ['og:title','og:description','og:image']:
        results[f'OG {tag}'] = 'yes' if soup.find('meta', attrs={'property': tag}) else 'no'

    return results


def with_date(path_str: str, stamp: str) -> str:
    p = Path(path_str)
    stem = p.stem or "audit-seo"
    suffix = p.suffix or ".csv"
    return str(p.with_name(f"{stem}-{stamp}{suffix}"))

def main():
    parser = argparse.ArgumentParser(description="SEO audit to CSV")
    parser.add_argument('input', help='URL or newline-separated file of URLs')
    parser.add_argument('--csv', default='audit-seo.csv', help='Output CSV file')
    args = parser.parse_args()

    # Load URLs
    if os.path.isfile(args.input):
        with open(args.input) as f:
            urls = [line.strip() for line in f if line.strip()]
    else:
        urls = [args.input]

    stamp = date.today().strftime('%Y-%m-%d')
    out_csv = with_date(args.csv, stamp)
    # Prepare CSV
    # Run one URL to get headers
    first_code, first_html = fetch(urls[0])
    first_soup = BeautifulSoup(first_html or '', 'html.parser')
    headers = list(extract_checks(first_soup, urls[0], first_code).keys())

    with open(out_csv, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()

        for url in urls:
            code, html = fetch(url)
            if code is None:
                continue
            soup = BeautifulSoup(html, 'html.parser')
            row = extract_checks(soup, url, code)
            writer.writerow(row)
            print(f"[DONE] {url} ✓")

    print(f"Saved SEO audit results to {args.csv}")


if __name__ == '__main__':
    main()
