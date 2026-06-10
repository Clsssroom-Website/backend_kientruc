import bcrypt from "bcryptjs";

export interface IHashStrategy {
  hash(data: string, saltOrRounds?: number | string): Promise<string>;
  compare(data: string, encrypted: string): Promise<boolean>;
}

export class BcryptHashStrategy implements IHashStrategy {
  async hash(data: string, saltOrRounds: number | string = 10): Promise<string> {
    return bcrypt.hash(data, saltOrRounds);
  }

  async compare(data: string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}

// Keep the old name as an alias for backward compatibility or ease of migration
export { BcryptHashStrategy as HashStrategy };

