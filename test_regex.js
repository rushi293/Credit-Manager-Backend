const regex = /^\s*([A-Za-z0-9_-]+)\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+([\d\.,\s-]+)$/;
const line = 'AMUL2610577 08/10/2026 CHILD HOUSE (DREAM LAND) 4400.00 0.00 0.00 0.00 0.00 0.00 220.00 0.00 0.00 4620.00 ';
const match = line.match(regex);
console.log('Match?', !!match);
if (match) {
  console.log('1:', match[1]);
  console.log('2:', match[2]);
  console.log('3:', match[3]);
  console.log('4:', match[4]);
}
