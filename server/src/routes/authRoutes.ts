import { Router } from 'express';
import { login, logout, register, getCurrentUser, requestReset, resetPassword, updateProfile, changePassword } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { rateLimit } from '../middleware/rateLimit';
import { z } from 'zod';

const router = Router();

const password = z.string().min(12).max(128);
const email = z.string().email().max(255).transform(value => value.toLowerCase().trim());
const authLimiter = rateLimit(15 * 60_000, 10);

router.post('/login', authLimiter, validateBody(z.object({ email, password: z.string().min(1).max(128) })), login);
router.post('/register', authLimiter, validateBody(z.object({ email, password, name: z.string().trim().min(2).max(255) })), register);
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', authenticate, logout);
router.post('/request-reset', authLimiter, validateBody(z.object({ email })), requestReset);
router.post('/reset-password', authLimiter, validateBody(z.object({ token: z.string().min(20), newPassword: password })), resetPassword);
router.patch('/profile/:id', authenticate, validateBody(z.object({ name: z.string().trim().min(2).max(255) }).strict()), updateProfile);
router.post('/change-password/:id', authenticate, authLimiter, validateBody(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password })), changePassword);

export default router;
