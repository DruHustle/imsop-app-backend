import { Request, Response } from "express";
import { db } from "../config/db";
import { users } from "../models/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../services/passwords";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/auth";
import { getJwtSecret } from "../config/security";
import { connection } from "../config/db";
import { randomUUID, randomInt } from "node:crypto";
import { queuePasswordReset } from "../services/resetDelivery";

const authCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("none" as const)
      : ("lax" as const),
  maxAge: 15 * 60 * 1000,
  path: "/",
});

const publicUser = (user: typeof users.$inferSelect) => ({
  id: String(user.id),
  email: user.email,
  name: user.name,
  role: user.role,
});

async function createSession(user: typeof users.$inferSelect) {
  const sid = randomUUID();
  await connection.query(
    `INSERT INTO auth_sessions(id,user_id,workspace_id,version,role,expires_at)
 VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')`,
    [sid, user.id, user.activeWorkspaceId, user.sessionVersion, user.role],
  );
  return jwt.sign({ id: user.id, sid }, getJwtSecret(), {
    expiresIn: "15m",
    issuer: "imsop-api",
    audience: "imsop-web",
  });
}
export const login = async (req: Request, res: Response) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, req.body.email),
    });
    if (
      !user ||
      user.disabled ||
      !(await verifyPassword(req.body.password, user.password))
    )
      return res.status(401).json({ error: "Invalid email or password" });
    res.cookie("imsop_access", await createSession(user), authCookieOptions());
    res.json({ user: publicUser(user) });
  } catch {
    res.status(503).json({ error: "Sign in temporarily unavailable" });
  }
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  try {
    const hashedPassword = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        name,
        role: "user",
      })
      .onConflictDoNothing({ target: users.email })
      .returning();

    if (!newUser) return res.status(409).json({ error: "User already exists" });
    const token = await createSession(newUser);
    res.cookie("imsop_access", token, authCookieOptions());
    res.status(201).json({ user: publicUser(newUser) });
  } catch (error) {
    res.status(500).json({ error: "Failed to register user" });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sessionInfo = (req: AuthRequest, res: Response) =>
  res.json(req.user);
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    await connection.query(
      "UPDATE auth_sessions SET revoked_at=now() WHERE id=$1",
      [req.user!.sessionId],
    );
    res.clearCookie("imsop_access", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    res.status(204).end();
  } catch {
    res
      .status(503)
      .json({ error: "Sign out could not be confirmed. Retry sign out." });
  }
};
export const requestReset = async (req: Request, res: Response) => {
  const earliest=Date.now()+150+randomInt(0,51);
  try {
    await queuePasswordReset(req.body.email);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,earliest-Date.now())));
    res
      .status(202)
      .json({
        success: true,
        message:
          "If this account is eligible, a reset link has been requested. Delivery may take a few minutes.",
      });
  } catch {
    res
      .status(503)
      .json({
        error: "Recovery requests are temporarily unavailable. Please retry.",
      });
  }
};
export const resetPassword = async (req: Request, res: Response) => {
  let decoded: jwt.JwtPayload;
  try {
    const d = jwt.verify(req.body.token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: "imsop-api",
      audience: "imsop-password-reset",
    });
    if (
      typeof d === "string" ||
      d.purpose !== "password-reset" ||
      !Number.isInteger(d.id) ||
      !Number.isInteger(d.resetVersion)
    )
      throw new Error();
    decoded = d;
  } catch {
    return res
      .status(400)
      .json({
        error:
          "This reset link is invalid, expired or already used. Request a new link.",
      });
  }
  try {
    const result = await connection.query(
      `UPDATE users SET password=$1,password_reset_version=password_reset_version+1,session_version=session_version+1
   WHERE id=$2 AND password_reset_version=$3 AND NOT disabled RETURNING id`,
      [
        await hashPassword(req.body.newPassword),
        decoded.id,
        decoded.resetVersion,
      ],
    );
    if (result.rowCount !== 1)
      return res
        .status(400)
        .json({
          error:
            "This reset link is invalid, expired or already used. Request a new link.",
        });
    res.json({
      success: true,
      message: "Password reset. Sign in with your new password.",
    });
  } catch {
    res
      .status(503)
      .json({
        error:
          "Recovery is temporarily unavailable. Your link is retained on this page; retry.",
      });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (String(req.user?.id) !== id)
    return res.status(403).json({ error: "Forbidden" });
  const updates = { name: req.body.name };

  try {
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, Number(id)));
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, Number(id)),
    });
    if (!updatedUser) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(updatedUser) });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  if (String(req.user?.id) !== id)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, Number(id)),
    });

    if (!user || !(await verifyPassword(currentPassword, user.password))) {
      return res.status(400).json({ error: "Invalid current password" });
    }

    const hashedPassword = await hashPassword(newPassword);
    const changed = await connection.query(
      `UPDATE users SET password=$1,password_reset_version=password_reset_version+1,session_version=session_version+1
     WHERE id=$2 AND password_reset_version=$3 AND session_version=$4 AND NOT disabled RETURNING id`,
      [hashedPassword, user.id, user.passwordResetVersion, user.sessionVersion],
    );
    if (changed.rowCount !== 1)
      return res
        .status(409)
        .json({ error: "Account changed. Sign in and retry." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to change password" });
  }
};
