import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  Transport,
  type ClientProvider,
  type ClientsModuleOptionsFactory,
} from '@nestjs/microservices';
import { EMBEDDING_SERVICE_NAME, MESHDEX_ML_V1_PACKAGE_NAME } from '@meshdex/proto/ml/v1';
import { mlServiceConfig } from '../../../config/config.namespaces';
import {
  RETRY_BACKOFF_MULTIPLIER,
  RETRY_INITIAL_BACKOFF,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_BACKOFF,
} from '../ml-service.constants';

/** Same scheme as `AssetServiceClientOptionsFactory`. */
@Injectable()
export class MlServiceClientOptionsFactory implements ClientsModuleOptionsFactory {
  constructor(
    @Inject(mlServiceConfig.KEY)
    private readonly config: ConfigType<typeof mlServiceConfig>,
  ) {}

  createClientOptions(): ClientProvider {
    return {
      transport: Transport.GRPC,
      options: {
        url: this.config.url,
        package: MESHDEX_ML_V1_PACKAGE_NAME,
        protoPath: require.resolve('@meshdex/proto/proto/meshdex/ml/v1/ml.proto'),
        // Must match how ts-proto generated the types (buf.gen.yaml).
        loader: {
          keepCase: false,
          longs: Number,
          defaults: true,
          oneofs: true,
        },
        channelOptions: {
          'grpc.service_config': JSON.stringify(this.serviceConfig()),
        },
      },
    };
  }

  /** RESOURCE_EXHAUSTED isn't retried: hitting a busy replica again adds load (ADR 019). */
  private serviceConfig(): object {
    return {
      methodConfig: [
        {
          name: [
            {
              service: `${MESHDEX_ML_V1_PACKAGE_NAME}.${EMBEDDING_SERVICE_NAME}`,
              method: 'SearchAssets',
            },
          ],
          timeout: this.toDuration(this.config.searchTimeoutMs),
          retryPolicy: {
            maxAttempts: RETRY_MAX_ATTEMPTS,
            initialBackoff: RETRY_INITIAL_BACKOFF,
            maxBackoff: RETRY_MAX_BACKOFF,
            backoffMultiplier: RETRY_BACKOFF_MULTIPLIER,
            retryableStatusCodes: ['UNAVAILABLE'],
          },
        },
      ],
    };
  }

  /** Object form: grpc-js misreads fractional strings such as "2.5s". */
  private toDuration(ms: number): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(ms / 1000),
      nanos: (ms % 1000) * 1_000_000,
    };
  }
}
