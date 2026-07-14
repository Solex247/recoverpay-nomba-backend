// src/services/checkoutService.ts
import { db } from "../prisma/client";
import { getTenantNombaClient } from "../nomba/nombaClient";

export async function finalizeFirstPayment(orderReference: string) {
  const attempt = await db.chargeAttempt.findUnique({
    where: { orderReference },
    include: {
      invoice: {
        include: {
          subscription: {
            include: {
              customer: true,
              plan: true,
            },
          },
        },
      },
    },
  });

  if (!attempt) return { ok: false, reason: "unknown orderReference" };
  if (attempt.invoice.status === "paid") return { ok: true, alreadyProcessed: true };

  // Get tenant's Nomba client for verification
  const tenantId = attempt.invoice.subscription.plan.tenantId;
  const nombaClient = await getTenantNombaClient(tenantId).catch(() => null);

  if (!nombaClient) {
    return { ok: false, reason: "tenant Nomba credentials not configured" };
  }

  const verified = await nombaClient.verifyTransaction({ orderReference });

  // Sandbox: data.success === true | Production: data.status === "SUCCESS"
  const isSandbox = (process.env.NOMBA_BASE_URL || "").includes("sandbox");
  const isSuccess = isSandbox
    ? verified?.data?.success === true
    : verified?.data?.status === "SUCCESS";

  if (!isSuccess) {
    await db.chargeAttempt.update({
      where: { orderReference },
      data: { status: "failed", message: "payment not confirmed" },
    });
    return { ok: false, reason: "payment not confirmed by Nomba" };
  }

  const tokenKey = await nombaClient
    .getLatestTokenForCustomer(attempt.invoice.subscription.customer.email)
    .catch(() => null);

  await db.$transaction([
    db.chargeAttempt.update({ where: { orderReference }, data: { status: "success" } }),
    db.invoice.update({
      where: { id: attempt.invoice.id },
      data: { status: "paid", amountPaid: attempt.invoice.amountDue },
    }),
    db.subscription.update({
      where: { id: attempt.invoice.subscriptionId },
      data: { status: "active" },
    }),
    ...(tokenKey
      ? [db.customer.update({
          where: { id: attempt.invoice.subscription.customerId },
          data: { tokenKey },
        })]
      : []),
  ]);

  return { ok: true };
}
