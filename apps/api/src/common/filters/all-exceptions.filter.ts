import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

import type { ApiErrorEnvelope } from "@quanta/shared";

/** Wraps every error in the standard envelope required by the spec. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = "Internal Server Error";
    let message = "Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        error = exception.name;
      } else {
        const obj = body as Record<string, unknown>;
        const rawMessage = obj.message ?? message;
        message = Array.isArray(rawMessage) ? rawMessage.join(", ") : String(rawMessage);
        error = String(obj.error ?? exception.name);
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope: ApiErrorEnvelope = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(envelope);
  }
}
