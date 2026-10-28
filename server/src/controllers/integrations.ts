import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { readSapMetadata } from "../services/sap";
export async function sapMetadata(req: AuthRequest, res: Response) {
  try {
    const result = await readSapMetadata(req.user!.workspaceId!);
    res
      .status(
        result.status === "not-configured"
          ? 503
          : result.status === "not-authorized"
            ? 403
            : 200,
      )
      .json(result);
  } catch {
    res
      .status(502)
      .json({
        status: "unavailable",
        error:
          "The configured SAP service did not return bounded readable metadata. No records were synchronized.",
      });
  }
}
