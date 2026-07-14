import Redis from "ioredis";

// General Redis connection — used for token caching in nombaClient.ts
export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// BullMQ requires a connection options object, not a Redis instance
// Use this for all Queue and Worker constructors
export const bullMQConnection = {
  url: process.env.REDIS_URL!,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

redisConnection.on("error", (err) => {
  console.error("[redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.log("[redis] Connected");
});
