const text = 
AMUL2610577 08/10/2026 CHILD HOUSE (DREAM LAND) 4400.00 0.00 0.00 0.00 0.00 0.00 220.00 0.00 0.00 4620.00 
AMUL2610578 08/10/2026 DWARKADHISH JENERAL... 2640.38 0.00 0.00 0.00 0.00 0.00 132.02 0.00 0.00 2772.00 
AMUL2610579 08/10/2026 SHRI HARI SODA ICECREAM 2466.03 0.00 0.00 0.00 54.28 0.00 120.59 0.00 0.00 2532.00 
AMUL2610580 08/10/2026 MATEL DAIRY 1665.71 0.00 0.00 0.00 0.00 0.00 83.29 0.00 0.00 1749.00 
;

const singleLineText = text.replace(/
/g, ' ');
const globalRegex = /([A-Za-z0-9_-]{6,})\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+([^0-9]+?)\s+((?:[\d,]+\.\d{2}\s*){3,})/g;

let match;
while ((match = globalRegex.exec(singleLineText)) !== null) {
  console.log('Bill:', match[1], 'Date:', match[2], 'Name:', match[3], 'Net:', match[4].trim().split(/\s+/).pop());
}

