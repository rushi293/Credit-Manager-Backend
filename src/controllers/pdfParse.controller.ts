import { Request, Response } from 'express';
import pdfParse from 'pdf-parse';

// Custom pagerender to perfectly extract rows using Y coordinates, 
// ensuring columns are ordered strictly by X coordinates left-to-right.
const render_page = async function(pageData: any) {
  const textContent = await pageData.getTextContent();
  const rows: Record<number, any[]> = {};
  
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    const y = item.transform[5]; // vertical coordinate
    
    // Cluster Y coordinates within 4 pixels to group text on the same row
    const yKeys = Object.keys(rows).map(Number);
    const yCluster = yKeys.find(k => Math.abs(k - y) < 4);
    
    if (yCluster !== undefined) {
      rows[yCluster].push(item);
    } else {
      rows[y] = [item];
    }
  }
  
  // PDF coordinates usually go bottom-to-top, so sort Y descending
  const sortedYKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
  let pageText = '';
  
  for (const y of sortedYKeys) {
    const rowItems = rows[y];
    // Sort items left-to-right
    rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
    
    // Join all column fragments with a single space
    const rowString = rowItems.map(item => item.str.trim()).join(' ');
    pageText += rowString + '\n';
  }
  
  return pageText;
};

export const parseBillPdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, error: 'File must be a PDF' });
    }

    // Extract text using X/Y grouping to guarantee correct row sequence
    const data = await pdfParse(file.buffer, { pagerender: render_page });
    const text = data.text;
    
    const bills = [];
    const lines = text.split('\n');
    
    // Regex that handles spaces, commas, and grabs everything after the Retailer Name
    const flexibleRegex = /^\s*([A-Za-z0-9_-]+)\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+([\d\.,\s-]+)$/;

    for (let line of lines) {
      line = line.trim();
      const match = line.match(flexibleRegex);
      if (match) {
        let billNumber = match[1];
        const billDateStr = match[2];
        const retailerRaw = match[3];
        const amountsRaw = match[4];
        
        if (!/^[\d\.,\s-]+$/.test(amountsRaw)) continue;

        // Ensure we strictly enforce that this is a valid line and not a header
        if (retailerRaw.toLowerCase().includes('retailer name')) continue;

        const suffixMatch = billNumber.match(/(\d{4})$/);
        let extractedNumber = billNumber;
        if (suffixMatch) {
          extractedNumber = suffixMatch[1];
        } else {
          const digits = billNumber.match(/(\d+)$/);
          if (digits) {
             extractedNumber = digits[1].padStart(4, '0');
          }
        }

        const [day, month, year] = billDateStr.split(/[\/\-]/);
        const parsedDate = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
        
        if (isNaN(parsedDate.getTime())) continue;

        const amounts = amountsRaw.trim().split(/\s+/);
        if (amounts.length > 0) {
          // The Net Amount is exactly the last column
          const netAmtStr = amounts[amounts.length - 1];
          const netAmt = parseFloat(netAmtStr.replace(/,/g, ''));
          
          if (!isNaN(netAmt)) {
            bills.push({
              billNumber: extractedNumber,
              billDate: parsedDate.toISOString(),
              retailerName: retailerRaw.trim(),
              netAmount: netAmt,
              originalLine: line
            });
          }
        }
      }
    }

    if (bills.length === 0) console.log('DEBUG PDF TEXT:', text); 
    res.json({ success: true, data: bills, _debug_total_lines: lines.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
