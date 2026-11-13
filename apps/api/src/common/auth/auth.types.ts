export interface AuthUser {
  userId: string;   // Resume-owned user id
  tenantId: string;
  issuer: string;
  subject: string;
}
