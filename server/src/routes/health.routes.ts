import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /health
 *
 * Simple health-check endpoint. Returns 200 with a status object
 * and the server's current timestamp.
 */
router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default router;
