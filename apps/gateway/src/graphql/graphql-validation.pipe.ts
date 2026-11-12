import {
  Injectable,
  UnprocessableEntityException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

/**
 * Validates every `@Args` class with class-validator. Throws 422, which NestJS's Apollo
 * driver turns into `extensions.code: BAD_USER_INPUT` (400 would become BAD_REQUEST), with
 * the violated rules as the message ("id must be a UUID") instead of a generic HTTP text.
 */
@Injectable()
export class GraphqlValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  override createExceptionFactory(): (errors?: ValidationError[]) => UnprocessableEntityException {
    return (errors = []) =>
      new UnprocessableEntityException(this.flattenValidationErrors(errors).join('; '));
  }
}
