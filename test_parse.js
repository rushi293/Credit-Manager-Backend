const fs = require('fs');
const pdfParse = require('pdf-parse');

async function test() {
  const render_page = async function(pageData) {
    const textContent = await pageData.getTextContent();
    const rows = {};
    for (const item of textContent.items) {
      if (!item.str.trim()) continue;
      const y = item.transform[5];
      const yKeys = Object.keys(rows).map(Number);
      const yCluster = yKeys.find(k => Math.abs(k - y) < 4);
      
      if (yCluster !== undefined) {
        rows[yCluster].push(item);
      } else {
        rows[y] = [item];
      }
    }
    
    const sortedYKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    let pageText = '';
    
    for (const y of sortedYKeys) {
      const rowItems = rows[y];
      rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
      
      // Some text items are split even within the same column (e.g. DWARKADHISH JENERAL...)
      // If the X distance between two items is very small, they belong to the same column!
      const mergedCols = [];
      for (const item of rowItems) {
        const x = item.transform[4];
        if (mergedCols.length > 0) {
           const lastCol = mergedCols[mergedCols.length - 1];
           // Approximate width of last string
           const expectedEnd = lastCol.x + (lastCol.str.length * 6); // rough estimate
           if (x - expectedEnd < 15) { // tight spacing
             lastCol.str += ' ' + item.str.trim();
             continue;
           }
        }
        mergedCols.push({ x: x, str: item.str.trim() });
      }

      const rowString = mergedCols.map(col => col.str).join(' | ');
      pageText += rowString + '\n';
    }
    return pageText;
  };

  try {
    const data = await pdfParse(fs.readFileSync('test.pdf'), { pagerender: render_page });
    console.log(data.text);
  } catch (e) {
    console.error(e);
  }
}
test();
