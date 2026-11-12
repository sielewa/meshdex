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

/**
 * A real gRPC server for `meshdex.asset.v1.AssetService`, loaded from the same .proto with
 * asset-service's loader options, so tests exercise the gateway's real client (loader
 * options, service config, error codes) over the network. Every method is a jest mock;
 * unconfigured methods answer UNIMPLEMENTED instead of hanging until the deadline.
 */
export class FakeAssetServiceServer {
  readonly handlers: Record<string, jest.Mock<undefined, Parameters<Handler>>> = {};
  private readonly server = new Server();

  /** Binds to a random local port and returns the `host:port` to connect to. */
  async start(): Promise<string> {
    const definition = loadPackageDefinition(
      loadSync(require.resolve('@meshdex/proto/proto/meshdex/asset/v1/asset.proto'), {
        keepCase: false,
        longs: Number,
        defaults: true,
        oneofs: true,
      }),
    );
    const meshdex = definition.meshdex as GrpcObject;
    const v1 = (meshdex.asset as GrpcObject).v1 as GrpcObject;
    const service = (v1.AssetService as ServiceClientConstructor).service;
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
      throw new Error(`AssetService has no method ${method}`);
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
