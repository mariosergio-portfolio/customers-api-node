import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { errorBody } from '../middleware/errorHandler.js';
import { createCustomerController } from './customer.controller.js';
import {
  companyParamsSchema,
  customerParamsSchema,
  pronounceQuerySchema,
  searchQuerySchema,
} from './customer.schemas.js';

export function createCustomerRouter({ customerService, pronounceRateLimitPerMinute }) {
  const router = Router();
  const controller = createCustomerController({ customerService });

  // Every pronounce call is a paid AWS Polly request, so it gets its own rate limit.
  const pronounceLimiter = rateLimit({
    windowMs: 60_000,
    limit: pronounceRateLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(errorBody(429, 'Too many requests, please try again later')),
  });

  router.get(
    '/companies/:companyId/customers',
    validate({ params: companyParamsSchema, query: searchQuerySchema }),
    controller.search,
  );

  router.get(
    '/customers/:customerPk/pronounce',
    pronounceLimiter,
    validate({ params: customerParamsSchema, query: pronounceQuerySchema }),
    controller.pronounce,
  );

  return router;
}
