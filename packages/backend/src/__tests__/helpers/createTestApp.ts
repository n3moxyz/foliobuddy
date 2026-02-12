import express, { Router } from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';

/**
 * Creates a minimal Express app for integration testing.
 * Stubs auth by setting req.userId, mounts the provided router,
 * and attaches the error handler.
 */
export function createTestApp(router: Router, basePath = '/api/test') {
  const app = express();
  app.use(express.json());

  // Stub auth — set req.userId on every request
  app.use((req, _res, next) => {
    req.userId = 'test-user-id';
    next();
  });

  app.use(basePath, router);
  app.use(errorHandler);

  return app;
}
