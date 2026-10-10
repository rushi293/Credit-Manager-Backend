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

    // Rely on standard pdfParse text extraction
    const data = await pdfParse(file.buffer);
    
    // Convert to a single line so we don't care about page breaks, wrapped headers, or disjointed text
    const singleLineText = data.text.replace(/\n/g, ' ');
    
    const bills = [];
    
    // Global regex:
    // 1. Bill Number (>= 6 alphanumeric characters)
    // 2. Date (DD/MM/YYYY or DD-MM-YYYY)
    // 3. Retailer Name (anything until we hit the amounts)
    // 4. Amounts: exactly 9 or more consecutive decimal values (to capture Gross, Tax, Net, etc)
    const globalRegex = /([A-Za-z0-9_-]{6,})\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+((?:-?[\d,]+\.\d{2}\s*){9,})/g;
    
    let match;
    while ((match = globalRegex.exec(singleLineText)) !== null) {
      let billNumber = match[1];
      const billDateStr = match[2];
      const retailerRaw = match[3];
      const amountsRaw = match[4];

      // Ensure we don't accidentally capture header words in Retailer Name
      if (retailerRaw.toLowerCase().includes('retailer name')) continue;

      // Extract last 4 digits of bill number safely
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

      // Parse date DD/MM/YYYY strictly to UTC
      const [day, month, year] = billDateStr.split(/[\/\-]/);
      const parsedDate = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
      
      if (isNaN(parsedDate.getTime())) continue;

      // The Net Amount is the very last extracted numeric block
      const amounts = amountsRaw.trim().split(/\s+/);
      if (amounts.length >= 9) {
        const netAmtStr = amounts[amounts.length - 1];
        const netAmt = parseFloat(netAmtStr.replace(/,/g, ''));
        
        if (!isNaN(netAmt)) {
          bills.push({
            billNumber: extractedNumber,
            billDate: parsedDate.toISOString(),
            retailerName: retailerRaw.trim(),
            netAmount: netAmt,
            originalLine: match[0]
          });
        }
      }
    }

    if (bills.length === 0) {
       console.log('DEBUG PDF TEXT:', singleLineText);
    }
    
    res.json({ success: true, data: bills, _debug_total_extracted: bills.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
