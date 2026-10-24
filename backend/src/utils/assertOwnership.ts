import { Types } from 'mongoose';
import { UserRole } from '../modules/users/user.model';

interface OwnershipError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
}

export function createOwnershipError(): OwnershipError {
  const err = new Error('You do not have permission to access this resource') as OwnershipError;
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  err.isOperational = true;
  return err;
}

export function assertOwnership(
  userId: string,
  userRole: UserRole,
  resourceOwnerId: Types.ObjectId | string
) {
  const ownerIdStr =
    typeof resourceOwnerId === 'string'
      ? resourceOwnerId
      : resourceOwnerId.toString();

  if (userId !== ownerIdStr && userRole !== 'admin') {
    throw createOwnershipError();
  }
}
