import bcrypt from "bcryptjs";

export class HashStrategy {
  async hash(data: string, saltOrRounds: number | string = 10): Promise<string> {
    return bcrypt.hash(data, saltOrRounds);
  }

  async compare(data: string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}
