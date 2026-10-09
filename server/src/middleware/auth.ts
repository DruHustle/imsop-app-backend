import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: string;
  purpose?: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const cookieToken = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('imsop_access='))?.slice('imsop_access='.length);
  const token = req.headers.authorization?.split(' ')[1] || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { issuer: 'imsop-api', audience: 'imsop-web' });
    if (typeof decoded === 'string' || decoded.purpose === 'password-reset') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded as unknown as AuthenticatedUser;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
