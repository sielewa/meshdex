import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  Transport,
  type ClientProvider,
  type ClientsModuleOptionsFactory,
} from '@nestjs/microservices';
import { ASSET_SERVICE_NAME, MESHDEX_ASSET_V1_PACKAGE_NAME } from '@meshdex/proto/asset/v1';
import { assetServiceConfig } from '../../../config/config.namespaces';
import {
  RETRY_BACKOFF_MULTIPLIER,
  RETRY_INITIAL_BACKOFF,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_BACKOFF,
} from '../asset-service.constants';

/**
 * Builds the gRPC client options for asset-service, including a gRPC **service config**:
 * per-method deadlines and retry policies that grpc-js enforces for every call. Keeping
 * them here (declarative, one place) means no call site can forget a deadline, and the
 * retry rules sit next to the reason a method may or may not be retried.
 */
@Injectable()
export class AssetServiceClientOptionsFactory implements ClientsModuleOptionsFactory {
  /** Only sign URLs: safe to repeat after a lost response. */
  private readonly readMethods = ['GetUploadPartUrls'];

  /**
   * Change state but are idempotent in asset-service: repeating CompleteUpload returns the
   * same asset, repeating AbortUpload succeeds. They talk to object storage, hence the
   * longer write deadline.
   */
  private readonly idempotentWriteMethods = ['CompleteUpload', 'AbortUpload'];

  /** Never retried: every call creates a new asset, so a retry after a lost response duplicates it. */
  private readonly nonIdempotentWriteMethods = ['InitiateUpload'];

  constructor(
    @Inject(assetServiceConfig.KEY)
    private readonly config: ConfigType<typeof assetServiceConfig>,
  ) {}

  createClientOptions(): ClientProvider {
    return {
      transport: Transport.GRPC,
      options: {
        url: this.config.url,
        package: MESHDEX_ASSET_V1_PACKAGE_NAME,
        protoPath: require.resolve('@meshdex/proto/proto/meshdex/asset/v1/asset.proto'),
        // Must match how ts-proto generated the types (buf.gen.yaml) and how asset-service
        // loads the same file: camelCase fields, int64 as number, defaults filled in.
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

  /**
   * `timeout` is the deadline of the whole call, retries included, and is sent to the
   * server as `grpc-timeout`, so asset-service can stop work nobody waits for anymore.
   * Retries happen only on UNAVAILABLE (the request never reached a healthy server);
   * grpc-js randomises each backoff (jitter), so parallel uploads don't retry in sync.
   */
  private serviceConfig(): object {
    return {
      methodConfig: [
        {
          name: this.methodNames(this.readMethods),
          timeout: this.toDuration(this.config.readTimeoutMs),
          retryPolicy: this.retryPolicy(),
        },
        {
          name: this.methodNames(this.idempotentWriteMethods),
          timeout: this.toDuration(this.config.writeTimeoutMs),
          retryPolicy: this.retryPolicy(),
        },
        {
          name: this.methodNames(this.nonIdempotentWriteMethods),
          timeout: this.toDuration(this.config.writeTimeoutMs),
        },
      ],
    };
  }

  private methodNames(methods: string[]): { service: string; method: string }[] {
    const service = `${MESHDEX_ASSET_V1_PACKAGE_NAME}.${ASSET_SERVICE_NAME}`;

    return methods.map((method) => ({
      service,
      method,
    }));
  }

  private retryPolicy(): object {
    return {
      maxAttempts: RETRY_MAX_ATTEMPTS,
      initialBackoff: RETRY_INITIAL_BACKOFF,
      maxBackoff: RETRY_MAX_BACKOFF,
      backoffMultiplier: RETRY_BACKOFF_MULTIPLIER,
      retryableStatusCodes: ['UNAVAILABLE'],
    };
  }

  /**
   * Object form on purpose: grpc-js parses the string form ("2.5s") digit by digit and
   * would read the fraction as 5 nanoseconds instead of half a second.
   */
  private toDuration(ms: number): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(ms / 1000),
      nanos: (ms % 1000) * 1_000_000,
    };
  }
}
