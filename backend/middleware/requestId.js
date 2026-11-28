const crypto = require('crypto');

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * Attach a unique requestId to every incoming request and echo it back via X-Request-Id.
 * Downstream handlers, access logs, APM, and error handlers read req.requestId for tracing.
 */
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = requestId;
