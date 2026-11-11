import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidUploadRequestException } from './exceptions/invalid-upload-request.exception';
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';

/**
 * Maps domain exceptions to gRPC status codes (conventions: services never throw
 * transport errors). Unknown errors are returned as-is and end up as INTERNAL,
 * without leaking their message to the caller.
 */
export function toRpcException(error: unknown): unknown {
  if (error instanceof InvalidUploadRequestException) {
    return new RpcException({ code: status.INVALID_ARGUMENT, message: error.message });
  }

  if (error instanceof AssetVersionNotFoundException) {
    return new RpcException({ code: status.NOT_FOUND, message: error.message });
  }

  if (error instanceof UploadNotInProgressException) {
    return new RpcException({ code: status.FAILED_PRECONDITION, message: error.message });
  }

  return error;
}
