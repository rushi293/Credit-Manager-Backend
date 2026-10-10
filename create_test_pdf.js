const { jsPDF } = require('jspdf');
const fs = require('fs');

const doc = new jsPDF();
doc.text("Bill Number Bill Date Retailer Name Gross Amt Sch Disc Sales Return Rep. Value Disc RateChange Tax Amt Cr.Adj Db.Adj Net Amt", 10, 10);
doc.text("AMUL2610577 08/10/2026 CHILD HOUSE (DREAM LAND) 4400.00 0.00 0.00 0.00 0.00 0.00 220.00 0.00 0.00 4620.00", 10, 20);
doc.text("AMUL2610578 08/10/2026 DWARKADHISH JENERAL... 2640.38 0.00 0.00 0.00 0.00 0.00 132.02 0.00 0.00 2772.00", 10, 30);

fs.writeFileSync('test.pdf', Buffer.from(doc.output('arraybuffer')));
