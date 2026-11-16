import { Module } from '@nestjs/common';
import { HttpPolyhavenAdapter } from './infrastructure/http-polyhaven.adapter';
import { POLYHAVEN } from './polyhaven.tokens';

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
