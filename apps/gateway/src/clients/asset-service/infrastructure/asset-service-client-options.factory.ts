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

/** Deadlines and retries live in the service config, so no call site can forget them. */
@Injectable()
export class AssetServiceClientOptionsFactory implements ClientsModuleOptionsFactory {
  /** Only read (or only sign URLs): safe to repeat after a lost response. */
  private readonly readMethods = [
    'GetAsset',
    'BatchGetAssets',
    'ListAssets',
    'GetUploadPartUrls',
    'GetOriginalDownloadUrls',
  ];

  /** Idempotent in asset-service; longer deadline because they talk to object storage. */
  private readonly idempotentWriteMethods = ['CompleteUpload', 'AbortUpload'];

  /** A retry after a lost response would create a second asset. */
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
        // Must match ts-proto's generation options (buf.gen.yaml).
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

  /** `timeout` covers retries too; only UNAVAILABLE is retried. */
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

  /** grpc-js would read the string form "2.5s" as 2 s + 5 ns. */
  private toDuration(ms: number): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(ms / 1000),
      nanos: (ms % 1000) * 1_000_000,
    };
  }
}
