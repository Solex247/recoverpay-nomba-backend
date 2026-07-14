import { Request, Response, NextFunction } from "express";
import { db } from "../prisma/client";

export interface AuthedRequest extends Request {
  tenantId?: string;
}

export async function requireTenant(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.header("Authorization")?.replace("Bearer ", "").trim();
  if (!apiKey) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const tenant = await db.tenant.findUnique({ where: { apiKey } });
  if (!tenant) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  req.tenantId = tenant.id;
  next();
}
