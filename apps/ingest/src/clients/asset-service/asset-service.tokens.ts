/** `AssetServicePort` implementation (the gRPC adapter). */
export const ASSET_SERVICE = Symbol('ASSET_SERVICE');
/** NestJS `ClientGrpc` connected to asset-service; used only by the adapter. */
export const ASSET_SERVICE_GRPC_CLIENT = Symbol('ASSET_SERVICE_GRPC_CLIENT');
