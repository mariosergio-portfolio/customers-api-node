import { BadRequestError } from '../errors/index.js';

/**
 * Validates and coerces `req.params` / `req.query` with zod schemas.
 * Parsed values are exposed on `req.valid.params` / `req.valid.query`
 * (Express 5 makes `req.query` read-only, so the raw objects are left untouched).
 */
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    req.valid = {};
    for (const [part, schema] of Object.entries(schemas)) {
      const raw = req[part] ?? {};
      const result = schema.safeParse(raw);
      if (!result.success) {
        throw new BadRequestError(describeIssue(result.error.issues[0], raw));
      }
      req.valid[part] = result.data;
    }
    next();
  };
}

function describeIssue(issue, raw) {
  const field = issue.path[0];
  if (field === undefined) return issue.message;

  const value = raw[field];
  if (value === undefined) return `Required parameter '${String(field)}' is missing`;
  return `Invalid value '${String(value)}' for parameter '${String(field)}': ${issue.message}`;
}
