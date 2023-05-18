import fs from 'fs'
import { JSDOM } from "jsdom";
import puppeteer from "puppeteer";

const getListingLink = page => `https://www.doggoandco.com/?mylisting-ajax=1&action=get_listings&security=fe7921c970&form_data%5Bpage%5D=${page}&form_data%5Bpreserve_page%5D=false&form_data%5Bsort%5D=random&form_data%5Bsearch_keywords%5D=&form_data%5Bsearch_location%5D=&form_data%5Blat%5D=false&form_data%5Blng%5D=false&form_data%5Bproximity%5D=10&form_data%5Bregion%5D=&form_data%5Bcategory%5D=&form_data%5Btags%5D=&form_data%5Bdoggosize-allowed%5D=&form_data%5Banimals-allowed%5D=&form_data%5Bmax-pets%5D=&form_data%5Bleash-policy%5D=&form_data%5Benclosure-type%5D=&form_data%5Binclude-in-route-suggestions%5D=&form_data%5Binclude-in-area-suggestion%5D=&form_data%5Bdoes-your-lodgingcamping-facility-have-private-ablutions%5D=&form_data%5Bhot-tub%5D=&listing_type=real-estate&listing_wrap=col-md-12%20grid-item&proximity_units=km`;

// Get first page
const page1Data = await getPage(0);

console.log('gotten page 1:', Object.keys(page1Data))

console.log('real pages:', page1Data.max_num_pages);

// const TOTAL_PAGES = page1Data.max_num_pages;
const TOTAL_PAGES = 2;

// Get all pages
const pagePromises = [];

for (let ix = 1; ix < TOTAL_PAGES; ix++) {
    pagePromises.push(getPage(ix));
}

console.log('Getting pages:', pagePromises.length + 1);

const pagesData = [page1Data, ...(await Promise.all(pagePromises))].map(pageData => pageData.html);

console.log('Pages gotten:', pagesData.length)

// Parse the data
const data = {
    // categories: [],
    /** @type {{ name: string; link: string; address?: string; mapData?: { address: string; lat: number; lng: number }[]; categories: string[]; img: string; phone_number?: string; email?: string; }[]} */
    // locations: []
};

const locations = (await Promise.all(pagesData.map(html => parsePage(html)))).flat();

const browser = await puppeteer.launch();

for (let ix = 0; ix < locations.length; ix++) {
    try {
        const data = locations[ix];

        const page = await browser.newPage();

        await page.goto(data.link);

        console.log('Page loaded:', data.link);

        // Get phone_number
        const phoneNumberEle = await page.$('a[href^="tel:"]');

        if (phoneNumberEle) {
            data.phone_number = await phoneNumberEle.evaluate(ele => ele.href.replace('tel:', ''), phoneNumberEle);
        }

        console.log('number gotten')

        // Get email
        const emailEle = await page.$('a[href^="mailto:"]');

        if (emailEle) {
            data.email = await emailEle.evaluate(ele => ele.href.replace('mailto:', ''), emailEle)
        }

        console.log('email gotten')
    } catch (err) {
        await browser.close();
        break;
    }
}

await browser.close();

// fs.writeFileSync('./export.json', JSON.stringify(locations))

// console.log('locations:', locations);

async function parsePage(html) {
    const dom = new JSDOM(`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
    </head>
    <body>
        ${html}
    </body>
    </html>`);

    const dogDataList = Array.from(dom.window.document.body.children);

    return Promise.all(dogDataList.map(dogDataEle => parseDogDataEle(dogDataEle)));
}

/**
 * 
 * @param {Element} dogDataEle 
 */
async function parseDogDataEle(dogDataEle) {
    const firstChild = dogDataEle.children[0];

    // Get name
    const name = dogDataEle.querySelector('h4.listing-preview-title').textContent.trim();

    // Get link
    const link = dogDataEle.querySelector('.lf-item-default a').href;

    // Get mapData
    const locationInfo = firstChild.dataset.locations;

    let mapData;

    if (locationInfo !== 'false') {
        const parsedLocationInfo = locationInfo.replaceAll('&quot;', '"');
        mapData = JSON.parse(parsedLocationInfo)
    }

    // Get address
    const address = mapData ? dogDataEle.querySelector('ul.lf-contact').children[0].textContent.trim() : undefined;

    // Get categories
    const categories = Array.from(firstChild.classList.entries()).map(cat => cat[1]).filter(cat => cat.includes('job_listing_category')).map(cat => cat.replaceAll('job_listing_category-', ''));

    // Get img
    const img = dogDataEle.querySelector('.lf-background').style.backgroundImage.slice(4, -1).replace(/['"]/g, "");

    const payload = {
        name,
        link,
        mapData,
        address,
        categories,
        img,
    };

    console.log('payload:', payload)

    return payload
}

async function getPage(page) {
    const link = getListingLink(page);

    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("Cookie", `${Math.random()}=MU`);

    var raw = JSON.stringify({
        "x": Math.random()
    });

    var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    return (await fetch(link, requestOptions)).json()
}