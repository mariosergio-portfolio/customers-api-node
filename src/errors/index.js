/** Base class for errors that map to a known HTTP status and a client-safe message. */
export class AppError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.name = new.target.name;
    this.status = status;
  }
}

export class BadRequestError extends AppError {
  constructor(message, options) {
    super(400, message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message, options) {
    super(404, message, options);
  }
}

/** A dependency (e.g. AWS Polly) failed; not the client's fault. */
export class UpstreamServiceError extends AppError {
  constructor(message, options) {
    super(502, message, options);
  }
}
