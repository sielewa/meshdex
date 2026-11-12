import { Module } from '@nestjs/common';
import { HttpPolyhavenAdapter } from './infrastructure/http-polyhaven.adapter';
import { POLYHAVEN } from './polyhaven.tokens';

/** Client of the Poly Haven public API. Exports only the `POLYHAVEN` port. */
@Module({
  providers: [
    {
      provide: POLYHAVEN,
      useClass: HttpPolyhavenAdapter,
    },
  ],
  exports: [
    POLYHAVEN,
  ],
})
export class PolyhavenClientModule {}
