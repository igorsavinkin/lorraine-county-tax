const puppeteer = require("puppeteer");
const fs = require('fs').promises;

const $url_form = "https://loraincountyauditor.com/gis/report/Report.aspx?pin=";

const args = process.argv.slice(2); 
const $selector_timeout = args.length > 2 ? args[2] : 20000; // default "selector wait" timeout 
console.log("Selector timeout:", $selector_timeout, 'ms.' );
const tax_selector_check = "tbody[data-tableid=\"Taxes0\"] > tr[class=\"report-row\"] > td"; 
const tax_selector = "tbody[data-tableid=\"Taxes0\"]";
const folder ="data";


function dump(failed_pool, force=false){
	if (force || failed_pool.length >= 10){
		failed_pool.forEach( function (item) {
			stream.write(item + "\r\n");
		});
		failed_pool=[];
	}  
	return;	
}
async function scrapeProduct(browser_index, chunk, $headless  )  {	
   
	let browser = await puppeteer.launch({
		headless: $headless
	}); 
	for (let i=0; i < chunk.length; i++){
		let start = Date.now();  
		let page = await browser.newPage();
		
		//const navigationPromise = page.waitForNavigation({waitUntil: "domcontentloaded"});
		
		// 0 means an unlimited amount of time
		await page.setDefaultNavigationTimeout(0);
        await page.setDefaultTimeout(0);			  
		//await page.waitForNavigation({waitUntil: "domcontentloaded"})
		await page.goto($url_form + chunk[i]); 
		await page.waitForTimeout(1000);
		let $selector_wait;
        await page.waitForSelector(tax_selector_check, {timeout: $selector_timeout} )
		.then(() => {  	//console.log("Success with selector."); 	
			}).catch((err)=> { 
				console.log("Failure to get a tax info HTML element. Parcel: ", chunk[i] ,"\nERR:", err.name.slice(0, 50));
				failed_pool.push(chunk[i]);
				dump(failed_pool);
				$selector_wait = 0;								   
			} ); 
		//console.log("Selector wait:", $selector_wait);
		if ($selector_wait===0){
			//console.log("We skip processing cause of Timeout Error, parcel:", chunk[i]);
			continue;
		}
		let taxes = await page.$(tax_selector);
		//console.log("Taxes:" , typeof(taxes) ); 
		 
		await page.$eval( tax_selector, el => el.scrollIntoView());
	    
		
		let body = await page.$(tax_selector );		// , {timeout: 2000}
		
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
			if ( tax_inner_html.includes( '"Gross Full Year Tax","Special') ){
				failed_pool.push(chunk[i]);
				dump(failed_pool);
				console.log('Failure (2) to fetch tax info for parcel', chunk[i], "; browser: ", browser_index);
			} else {
				const tax_json =  '{ "parcel": "' + chunk[i] +'", ' + tax_inner_html.slice(1) + ', "time": "' + (Date.now() - start)/1000 + '" }';
				//console.log("Tax info:", tax_json); 
				console.log('Got info of parcel', chunk[i], "; browser: ", browser_index);
				await fs.writeFile(folder + '/' + chunk[i]+'.json', tax_json)
				      //.then(()=> { /* console.log("JSON is written"); */ });
			} 			
				
		} else {
			failed_pool.push(chunk[i]);
			dump(failed_pool);
			console.log('Failure to fetch tax info for parcel', chunk[i], "; browser: ", browser_index);
		}  
		// we close tab with an URL
		await page.close(); // ohterwise the browser will keep pages/tabs open and free RAM will be leaking
		
		if (i%20==0 && i>0){
			console.log('********** Browser ', browser_index, " has processed ", i , " items **********");
		}
	}
	console.log('************** Closing browser', browser_index, " and saving failed parcels **************");
	browser.close();
	console.log(new Date().toISOString());
	// we force to dump the "failed_pool" array since the scrape process is over for that browser.
	dump(failed_pool, true); 
}
 
var parcels = require('fs').readFileSync(folder + '/parcels.txt').toString().split("\r\n"); // Sync
var parcels_chunk;
var failed_pool=[];

// a stream for failed parcels.
var stream = require('fs').createWriteStream(folder + "/failed-parcels.txt", {flags:'a'});
//    We are not even required to use stream.end(), default option is AutoClose:true, 
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