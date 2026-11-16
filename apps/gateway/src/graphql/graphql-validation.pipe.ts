import {
  Injectable,
  UnprocessableEntityException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

/** 422, because Apollo turns it into BAD_USER_INPUT (400 would become BAD_REQUEST). */
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
