import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as healthController from "./health.controller.js";

const router = Router();

router.get("/", asyncHandler(healthController.check));

export default router;
