import fs from 'fs';
const path = './src/controllers/customer.controller.ts';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import { Decimal }')) {
  content = content.replace("import { calculateCustomerBalance } from '../services/finance.service';", "import { calculateCustomerBalance } from '../services/finance.service';\nimport { Decimal } from '@prisma/client/runtime/library';");
  fs.writeFileSync(path, content, 'utf8');
}
console.log("Decimal imported");
