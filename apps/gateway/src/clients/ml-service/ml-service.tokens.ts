/** `MlServicePort` implementation (the gRPC adapter). */
export const ML_SERVICE = Symbol('ML_SERVICE');
/** NestJS `ClientGrpc` connected to ml-service; used only by the adapter. */
export const ML_SERVICE_GRPC_CLIENT = Symbol('ML_SERVICE_GRPC_CLIENT');
