const puppeteer = require("puppeteer");
const fs = require('fs').promises;

const $url_form = "https://loraincountyauditor.com/gis/report/Report.aspx?pin=";

const args = process.argv.slice(2); 
const tax_selector = "tbody[data-tableid=\"Taxes0\"]";  

async function scrapeProduct(browser_index, chunk, $headless  )  {	
   
	let browser = await puppeteer.launch({
		headless: $headless
	}); 
	for (let i=0; i < chunk.length; i++){
		let start = Date.now();  
		let page = await browser.newPage();
		// 0 means an unlimited amount of time
		await page.setDefaultNavigationTimeout(0);
        		
		await page.goto($url_form + chunk[i]); 	  
		
		await page.waitForSelector(tax_selector);
	 
		let taxes = await page.$(tax_selector);
		//console.log("Taxes:" , typeof(taxes) ); 	  
		
		 
		await page.$eval( tax_selector, el => el.scrollIntoView());
	    await page.waitForTimeout(1000);
		
		let body = await page.$(tax_selector);		
		
		// process HTML
		let tax_property = await body.getProperty('innerHTML');
		let tax_inner_html = await tax_property.jsonValue();		
		
		console.log("Time:", (Date.now() - start)/1000);
		
		if (tax_inner_html) { 
			tax_inner_html = tax_inner_html.replaceAll('<tr class="report-row">', '');
			tax_inner_html = tax_inner_html.replaceAll('</tr>', '') ;
			tax_inner_html = tax_inner_html.replaceAll('<td class="report-label">', ',"');
			tax_inner_html = tax_inner_html.replaceAll('</td><td>', '":"');
			tax_inner_html = tax_inner_html.replaceAll('</td>', '"');
			tax_inner_html = tax_inner_html.replaceAll('&nbsp;','');
			tax_inner_html = tax_inner_html.replaceAll(':""', '');
			const tax_json =  '{ "parcel": "' + chunk[i] +'", ' + tax_inner_html.slice(1) + ', "time": "' + (Date.now() - start)/1000 + '" }';
			//console.log("Tax info:", tax_json); 
			console.log('Got info of parcel', chunk[i], "; browser: ", browser_index);
			await fs.writeFile('data2/'+chunk[i]+'.json', tax_json)
				.then(()=> { console.log("JSON is written"); });
		} else {
			failed_pool.push(chunk[i]);
			if (failed_pool.length > 10){
				failed_pool.forEach( function (item) {
					stream.write(item + "\n");
				});
				failed_pool=[];
			}
			console.log('Failure to fetch tax info for parcel', chunk[i], "; browser: ", browser_index);
		}  
		// we close tab with that URL
		await page.close(); // ohterwise the browser will keep pages/tabs open and RAM will be leaking
		
		if (i%10==0){
			console.log('********** Browser ', browser_index, " has processed ", i , " items **********");
		}
	}
	console.log('************** Closing browser ', browser_index, "**************");
	browser.close();
	console.log(new Date().toISOString());
	failed_pool.forEach( function (item) {
		stream.write(item + "\n");
	});
	failed_pool=[];
}
 
var parcels = require('fs').readFileSync('parcel-list.txt').toString().split("\r\n");// Sync
var parcels_chunk;
var failed_pool=[];

var stream = require('fs').createWriteStream("data2/failed_parcels.txt", {flags:'a'});
//  You are not even required to use stream.end(), default option is AutoClose:true, 
// so your file will end when your process ends and you avoid opening too many files.
// stream.end();

var browser_number = args.length > 1 ? args[1] : 4;
var chunk_size = Math.ceil(parcels.length / browser_number); 
console.log("Max chunk size:", chunk_size);
for (b=1; b <= browser_number ; b++){
	parcels_chunk = parcels.slice( (b-1) * chunk_size , b * chunk_size );
	console.log("Chunk ", b, parcels_chunk);	
	scrapeProduct(b, parcels_chunk, args[0] != '0' ? false : true );
}


// https://github.com/ZeroCho/nodejs-crawler/blob/50b1a724e7be4a7350eda872d60d562c8a11f571/3.csv-puppeteer-multipage/index.js