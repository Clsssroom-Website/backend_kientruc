// 1. Giao diện (Product)
export interface ILogger {
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
}

// 2. Các lớp thực thi giao diện (Concrete Products)
export class ConsoleLogger implements ILogger {
    info(message: string, meta?: any): void {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta || '');
    }
    warn(message: string, meta?: any): void {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta || '');
    }
    error(message: string, meta?: any): void {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta || '');
    }
    debug(message: string, meta?: any): void {
        console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta || '');
    }
}

// 3. Lớp Creator (Factory)
export abstract class LoggerFactory {
    // Factory method
    abstract createLogger(): ILogger;

    public getLogger(): ILogger {
        return this.createLogger();
    }
}

// 4. Các lớp Concrete Creators
export class ConsoleLoggerFactory extends LoggerFactory {
    createLogger(): ILogger {
        return new ConsoleLogger();
    }
}

// Khởi tạo instance logger duy nhất để sử dụng ở các nơi khác
const factory = new ConsoleLoggerFactory();
export const logger = factory.getLogger();
