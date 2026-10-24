import { Request, Response, NextFunction } from 'express';
import * as orderService from './order.service';
import {
  CreateOrderInput,
  OrderQuery,
  OrderStatusInput,
} from './order.schema';
import { OrderStatus } from './order.model';
import { UserRole } from '../users/user.model';

interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

function requireUser(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return false;
  }
  return true;
}

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Order not found' },
  });
}

export async function createOrder(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const order = await orderService.createOrder(
      req.userId!,
      req.body as CreateOrderInput
    );

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created from the accepted match',
    });
  } catch (error) {
    next(error);
  }
}

export async function listOrders(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const role =
      req.userRole === 'farmer' || req.userRole === 'buyer'
        ? req.userRole
        : undefined;

    const orders = await orderService.listOrders(
      req.userId!,
      role,
      req.query as unknown as OrderQuery
    );

    res.status(200).json({
      success: true,
      data: { count: orders.length, orders },
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrderById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const order = await orderService.getOrderById(req.userId!, req.params.id);
    if (!order) return notFound(res);

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

export async function changeOrderStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!requireUser(req, res)) return;

    const updated = await orderService.changeOrderStatus(
      req.userId!,
      req.params.id,
      (req.body as OrderStatusInput).status as OrderStatus
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: `Order status set to ${updated.status}`,
    });
  } catch (error) {
    next(error);
  }
}
