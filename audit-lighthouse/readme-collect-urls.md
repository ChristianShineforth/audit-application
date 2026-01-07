Two ways to crawl pathnames:

First way: this can only be used if it has robot.txt and sitemaps

it collect all urls of a website so it can be used to perform lighthouse
Run the following

* node extract-urls.mjs

It will generate a list of all the pathname so it can be used in the file called paths.txt

Second way: use this on any website and it will generate url.txt for all the pathnames
* node crawl-urls.mjs