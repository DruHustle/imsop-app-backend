import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';
import { connection } from '../config/db';

export interface AuthenticatedUser { id: number; email: string; role: string; sessionId: string; workspaceId: string | null; organizationId: string | null; }
export interface AuthRequest extends Request { user?: AuthenticatedUser; }
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
 const cookie = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('imsop_access='))?.slice(13);
 const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1] || cookie;
 if (!token) return res.status(401).json({error:'Sign in required',code:'SESSION_EXPIRED'});
 let claims: jwt.JwtPayload;
 try {
  const decoded=jwt.verify(token,getJwtSecret(),{algorithms:['HS256'],issuer:'imsop-api',audience:'imsop-web'});
  if(typeof decoded==='string' || !Number.isInteger(decoded.id) || typeof decoded.sid!=='string' || !/^[a-f0-9-]{36}$/.test(decoded.sid) || decoded.purpose) throw new Error();
  claims=decoded;
 } catch { return res.status(401).json({error:'Your session expired. Sign in again.',code:'SESSION_EXPIRED'}); }
 try {
  const result=await connection.query(`SELECT u.id,u.email,u.role,s.id AS session_id,s.workspace_id,w.dotnet_organization_id
   FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN workspaces w ON w.id=s.workspace_id
   WHERE s.id=$1 AND u.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.disabled
   AND s.version=u.session_version AND s.role=u.role AND s.workspace_id IS NOT DISTINCT FROM u.active_workspace_id
   AND (s.workspace_id IS NULL OR EXISTS(SELECT 1 FROM workspace_memberships m WHERE m.user_id=u.id AND m.workspace_id=s.workspace_id))`,[claims.sid,claims.id]);
  const row=result.rows[0];
  if(!row) return res.status(401).json({error:'Your session expired. Sign in again.',code:'SESSION_EXPIRED'});
  req.user={id:row.id,email:row.email,role:row.role,sessionId:row.session_id,workspaceId:row.workspace_id,organizationId:row.dotnet_organization_id};
  next();
 } catch { res.status(503).json({error:'Session verification unavailable'}); }
};
export const requireWorkspace=(req:AuthRequest,res:Response,next:NextFunction)=> req.user?.workspaceId ? next() : res.status(403).json({error:'Ask your workspace administrator to provision access.',code:'WORKSPACE_REQUIRED'});
export const authorize=(roles:string[]) => (req:AuthRequest,res:Response,next:NextFunction)=> !req.user || !roles.includes(req.user.role) ? res.status(403).json({error:'Forbidden'}) : next();
