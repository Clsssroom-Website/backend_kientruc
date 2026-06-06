import { Redis } from "ioredis";

class RedisManager {

  private static instance: RedisManager;

  private readonly redisClient: Redis;

  private constructor() {
    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

    this.redisClient = new Redis(REDIS_URL);

    this.redisClient.on("error", (err: Error) => {
      console.error("Redis Client Error", err);
    });

    this.redisClient.on("connect", () => {
      console.log("Connected to Redis.");
    });
  }

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  get client(): Redis {
    return this.redisClient;
  }
}

const redisClient = RedisManager.getInstance().client;

export { RedisManager };
export default redisClient;

