import { AppError } from '../errors/index.js';

/** Error payload shared by every error response: { status, message, timestamp }. */
export function errorBody(status, message) {
  return { status, message, timestamp: new Date().toISOString() };
}

export function notFoundHandler(req, res) {
  res.status(404).json(errorBody(404, `No resource found for ${req.method} ${req.path}`));
}

// Express recognises error handlers by their 4-argument signature, so `next` must stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    req.log.error({ err }, 'Error after response headers were sent');
    res.destroy();
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, err.message);
    else req.log.warn({ status: err.status, reason: err.message }, 'Request rejected');
    res.status(err.status).json(errorBody(err.status, err.message));
    return;
  }

  // Client errors raised by Express/body parsers (malformed JSON, payload too large, ...).
  if (err.expose && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    res.status(err.status).json(errorBody(err.status, err.message));
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json(errorBody(500, 'An unexpected error occurred'));
}
