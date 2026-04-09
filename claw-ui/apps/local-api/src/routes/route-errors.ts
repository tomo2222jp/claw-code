import type { FastifyReply } from "fastify";

import type { ApiErrorBody } from "../types/api-error.js";

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): ApiErrorBody {
  reply.code(statusCode);
  return {
    error: {
      code,
      message,
    },
  };
}
