import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Upsert matches on apiKey — safe to run multiple times
  const tenant = await db.tenant.upsert({
    where: { apiKey: "rp_test_demo_key_123456" },
    update: {},
    create: {
      name: "RecoverPay Demo",
      apiKey: "rp_test_demo_key_123456",
      plan: "free",
      planActive: true,
    },
  });

  console.log("\n✅ Demo tenant ready");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Tenant ID : ${tenant.id}`);
  console.log(`API Key   : ${tenant.apiKey}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nNext step: Connect your Nomba account");
  console.log("  POST /v1/nomba/connect with your credentials");
  console.log("  (Required before creating plans)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
