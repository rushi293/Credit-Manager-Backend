import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => 
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=== Single User Setup ===");
  console.log("This application is configured for a single administrator.");
  
  const email = await question("Enter administrator email: ");
  if (!email || !email.includes('@')) {
    console.error("Invalid email.");
    process.exit(1);
  }

  const password = await question("Enter administrator password (min 6 chars): ");
  if (!password || password.length < 6) {
    console.error("Invalid password.");
    process.exit(1);
  }

  const businessName = await question("Enter your Business Name: ");
  if (!businessName) {
    console.error("Business name required.");
    process.exit(1);
  }

  // Hash password using bcrypt
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  try {
    // Check if business exists, else create
    let business = await prisma.business.findFirst();
    if (!business) {
      business = await prisma.business.create({
        data: { name: businessName }
      });
      console.log(`Created business: ${business.name}`);
    } else {
      business = await prisma.business.update({
        where: { id: business.id },
        data: { name: businessName }
      });
      console.log(`Updated business: ${business.name}`);
    }

    // Check if user exists, else create
    let user = await prisma.user.findFirst();
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email, passwordHash, businessId: business.id }
      });
      console.log(`Updated admin user: ${user.email}`);
    } else {
      user = await prisma.user.create({
        data: { email, passwordHash, businessId: business.id, role: 'ADMIN' }
      });
      console.log(`Created admin user: ${user.email}`);
    }

    // Clean up any extra users just in case (enforce single user)
    const extraUsers = await prisma.user.findMany({
      where: { id: { not: user.id } }
    });
    
    if (extraUsers.length > 0) {
      console.log(`Removing ${extraUsers.length} extra users to enforce single-user mode...`);
      await prisma.user.deleteMany({
        where: { id: { not: user.id } }
      });
    }

    console.log("Setup complete! You can now log in with these credentials.");
  } catch (error) {
    console.error("Error setting up user:", error);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

main();
