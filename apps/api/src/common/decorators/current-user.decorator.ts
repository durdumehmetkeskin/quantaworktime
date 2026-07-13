import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../auth/jwt-payload.interface";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedRequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedRequestUser;
  },
);
