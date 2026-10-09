import { Request, Response } from 'express';
import { db } from '../config/db';
import { users } from '../models/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';
import { getJwtSecret } from '../config/security';
import { isEmailConfigured, sendPasswordResetEmail } from '../services/emailService';

const publicUser = (user: typeof users.$inferSelect) => ({
  id: String(user.id), email: user.email, name: user.name, role: user.role,
});

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '15m', issuer: 'imsop-api', audience: 'imsop-web' }
    );

    res.cookie('imsop_access', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await db.insert(users).values({
      email,
      password: hashedPassword,
      name,
      role: 'user',
    });

    const newUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!newUser) return res.status(500).json({ error: 'Failed to register user' });
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role }, getJwtSecret(),
      { expiresIn: '15m', issuer: 'imsop-api', audience: 'imsop-web' },
    );
    res.cookie('imsop_access', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 15 * 60 * 1000, path: '/',
    });
    res.status(201).json({ user: publicUser(newUser) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register user' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie('imsop_access', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/',
  });
  res.status(204).end();
};

export const requestReset = async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const token = user ? jwt.sign(
    { id: user.id, purpose: 'password-reset', resetVersion: user.passwordResetVersion }, getJwtSecret(),
    { expiresIn: '15m', issuer: 'imsop-api', audience: 'imsop-password-reset' },
  ) : undefined;
  if (token && isEmailConfigured()) {
    const baseUrl = process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:5173/#/reset-password';
    const resetUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;
    try {
      await sendPasswordResetEmail(user!.email, resetUrl);
    } catch (error) {
      console.error('[auth] Password reset email delivery failed', { userId: user!.id, error });
    }
  }
  res.status(202).json({ success: true, message: 'If the account exists, a reset link has been sent.', ...(process.env.NODE_ENV !== 'production' && token && !isEmailConfigured() && { token }) });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { issuer: 'imsop-api', audience: 'imsop-password-reset' });
    if (typeof decoded === 'string' || decoded.purpose !== 'password-reset' || typeof decoded.id !== 'number' || typeof decoded.resetVersion !== 'number') {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, decoded.id) });
    if (!user || user.passwordResetVersion !== decoded.resetVersion) return res.status(400).json({ error: 'Invalid or expired reset token' });
    await db.update(users).set({ password: await bcrypt.hash(newPassword, 12), passwordResetVersion: user.passwordResetVersion + 1 }).where(eq(users.id, decoded.id));
    res.json({ success: true, message: 'Password reset successfully' });
  } catch {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (String(req.user?.id) !== id) return res.status(403).json({ error: 'Forbidden' });
  const updates = { name: req.body.name };

  try {
    await db.update(users).set(updates).where(eq(users.id, Number(id)));
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, Number(id)),
    });
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  if (String(req.user?.id) !== id) return res.status(403).json({ error: 'Forbidden' });

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, Number(id)),
    });

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, Number(id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
};
