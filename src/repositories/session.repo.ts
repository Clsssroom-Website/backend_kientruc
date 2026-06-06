import redisClient from "../infrastructure/redisClient.js";

export const saveRefreshToken = async (userId: string, refreshToken: string, ttlSeconds: number): Promise<void> => {
  await redisClient.setex(`refresh_token:${refreshToken}`, ttlSeconds, userId);
};

export const findUserIdByRefreshToken = async (refreshToken: string): Promise<string | null> => {
  return redisClient.get(`refresh_token:${refreshToken}`);
};

export const deleteRefreshToken = async (refreshToken: string): Promise<void> => {
  await redisClient.del(`refresh_token:${refreshToken}`);
};

export const getFailedLoginAttempts = async (email: string): Promise<number> => {
  const count = await redisClient.get(`failed_login:${email}`);
  return count ? parseInt(count, 10) : 0;
};

export const incrementFailedLoginAttempts = async (email: string, ttlSeconds: number): Promise<number> => {
  const key = `failed_login:${email}`;
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, ttlSeconds);
  }
  return count;
};

export const resetFailedLoginAttempts = async (email: string): Promise<void> => {
  await redisClient.del(`failed_login:${email}`);
};
