import { UserRole } from '../modules/users/user.model';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: UserRole;
    }
  }
}

export {};
