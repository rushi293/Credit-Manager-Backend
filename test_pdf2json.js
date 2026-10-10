const PDFParser = require('pdf2json');
const fs = require('fs');

const pdfParser = new PDFParser();
pdfParser.on('pdfParser_dataReady', pdfData => {
  console.log(Object.keys(pdfData));
  if (pdfData.Pages) {
     console.log(pdfData.Pages[0].Texts.slice(0, 5));
  }
});

pdfParser.loadPDF('test.pdf');
