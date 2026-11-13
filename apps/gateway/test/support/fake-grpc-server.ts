import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  status,
  type GrpcObject,
  type ServiceClientConstructor,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

type Callback = (error: { code: number; details: string } | null, response?: unknown) => void;
type Handler = (request: Record<string, unknown>, callback: Callback) => void;

/** A service of `packages/proto`: its .proto file and its fully qualified name. */
export interface FakeServiceDefinition {
  /** Path inside `@meshdex/proto/proto/`, e.g. `meshdex/asset/v1/asset.proto`. */
  protoFile: string;
  /** e.g. `meshdex.asset.v1.AssetService`. */
  service: string;
}

export const ASSET_SERVICE: FakeServiceDefinition = {
  protoFile: 'meshdex/asset/v1/asset.proto',
  service: 'meshdex.asset.v1.AssetService',
};

export const EMBEDDING_SERVICE: FakeServiceDefinition = {
  protoFile: 'meshdex/ml/v1/ml.proto',
  service: 'meshdex.ml.v1.EmbeddingService',
};

/**
 * A real gRPC server for one service of `packages/proto`, loaded from the same .proto with the
 * services' loader options, so tests exercise the gateway's real clients (loader options,
 * service config, error codes) over the network. Every method is a jest mock; unconfigured
 * methods answer UNIMPLEMENTED instead of hanging until the deadline.
 */
export class FakeGrpcServer {
  readonly handlers: Record<string, jest.Mock<undefined, Parameters<Handler>>> = {};
  private readonly server = new Server();

  constructor(private readonly definition: FakeServiceDefinition) {}

  /** Binds to a random local port and returns the `host:port` to connect to. */
  async start(): Promise<string> {
    const loaded = loadPackageDefinition(
      loadSync(require.resolve(`@meshdex/proto/proto/${this.definition.protoFile}`), {
        keepCase: false,
        longs: Number,
        defaults: true,
        oneofs: true,
      }),
    );
    // Walks the package path: meshdex → asset → v1 → AssetService.
    const names = this.definition.service.split('.');
    const serviceName = names.pop() ?? '';
    const namespace = names.reduce<GrpcObject>(
      (object, name) => object[name] as GrpcObject,
      loaded,
    );
    const service = (namespace[serviceName] as ServiceClientConstructor).service;
    const implementation: UntypedServiceImplementation = {};

    for (const definitionOfMethod of Object.values(service)) {
      const method = definitionOfMethod.originalName ?? '';
      const handler = jest.fn<undefined, Parameters<Handler>>();
      this.handlers[method] = handler;
      implementation[method] = (
        call: { request: Record<string, unknown> },
        callback: Callback,
      ): void => {
        handler(call.request, callback);
      };
    }
    this.server.addService(service, implementation);
    this.reset();

    const port = await new Promise<number>((resolve, reject) => {
      this.server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, bound) => {
        if (error) {
          reject(error);
        } else {
          resolve(bound);
        }
      });
    });

    return `127.0.0.1:${String(port)}`;
  }

  /** Forgets recorded calls and configured answers. */
  reset(): void {
    for (const handler of Object.values(this.handlers)) {
      handler.mockReset();
      handler.mockImplementation((_request, callback) => {
        callback({
          code: status.UNIMPLEMENTED,
          details: 'not configured in this test',
        });
      });
    }
  }

  /** The next calls of `method` (camelCase proto name, e.g. `batchGetAssets`) succeed with `response`. */
  respond(method: string, response: unknown): void {
    this.handler(method).mockImplementation((_request, callback) => {
      callback(null, response);
    });
  }

  /** The next calls of `method` fail with a gRPC status. */
  fail(method: string, code: status, details: string): void {
    this.handler(method).mockImplementation((_request, callback) => {
      callback({
        code,
        details,
      });
    });
  }

  /** Requests received by `method`, in order. */
  requests(method: string): Record<string, unknown>[] {
    return this.handler(method).mock.calls.map(([request]) => request);
  }

  handler(method: string): jest.Mock<undefined, Parameters<Handler>> {
    const handler = this.handlers[method];

    if (!handler) {
      throw new Error(`${this.definition.service} has no method ${method}`);
    }

    return handler;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.tryShutdown(() => {
        resolve();
      });
    });
  }
}
