declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      logisticsProvider?: string;
    }
  }
}

export {};
