import { Request, Response } from 'express';
import pdfParse from 'pdf-parse';

export const parseBillPdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ success: false, error: 'File must be a PDF' });
    }

    const data = await pdfParse(file.buffer);
    const text = data.text;
    
    const bills = [];
    const lines = text.split('\n');
    
    // Pattern to extract from line:
    // It starts with a Bill Number (e.g. AMUL2610577 or GSDF1234), 
    // then a Date (DD/MM/YYYY), 
    // then Retailer Name (which can have spaces),
    // then a series of decimal numbers.
    // To cleanly capture Retailer Name, we match everything up to the first space-separated number.
    const flexibleRegex = /^([A-Za-z0-9_-]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d\.\s-]+)$/;

    for (let line of lines) {
      line = line.trim();
      const match = line.match(flexibleRegex);
      if (match) {
        let billNumber = match[1];
        const billDateStr = match[2];
        const retailerRaw = match[3];
        const amountsRaw = match[4];
        
        // Ensure the last part really looks like a bunch of numbers
        if (!/^[\d\.\s-]+$/.test(amountsRaw)) continue;

        // Extract last 4 digits of bill number while preserving leading zeros
        // Example: AMUL2610577 -> 0577
        const suffixMatch = billNumber.match(/(\d{4})$/);
        let extractedNumber = billNumber;
        if (suffixMatch) {
          extractedNumber = suffixMatch[1];
        } else {
          // Fallback if there aren't 4 digits at the end
          const digits = billNumber.match(/(\d+)$/);
          if (digits) {
             extractedNumber = digits[1].padStart(4, '0');
          }
        }

        // Parse date DD/MM/YYYY safely
        const [day, month, year] = billDateStr.split('/');
        const parsedDate = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
        
        if (isNaN(parsedDate.getTime())) continue;

        // Extract Net Amt (the very last number on the line)
        const amounts = amountsRaw.trim().split(/\s+/);
        if (amounts.length > 0) {
          const netAmtStr = amounts[amounts.length - 1];
          const netAmt = parseFloat(netAmtStr);
          
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

    res.json({ success: true, data: bills });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
