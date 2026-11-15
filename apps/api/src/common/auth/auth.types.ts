export interface AuthUser {
  userId: string;   // Resume-owned user id
  tenantId: string;
  issuer: string;
  subject: string;
  roles?: string[]; // from the verified token "roles" claim; never from request input
}
