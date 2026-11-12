import { executeGraphql } from '@/graphql/execute-graphql';
import { graphql } from '@/graphql/gql';
import type { UploadApi } from '@/features/upload/types/upload-api';

export const initiateUploadDocument = graphql(`
  mutation InitiateUpload($input: InitiateUploadInput!) {
    initiateUpload(input: $input) {
      assetId
      assetVersionId
      partSizeBytes
      parts {
        partNumber
        url
        expiresAt
      }
    }
  }
`);

export const renewUploadPartUrlsDocument = graphql(`
  mutation RenewUploadPartUrls($assetVersionId: ID!, $partNumbers: [Int!]) {
    renewUploadPartUrls(assetVersionId: $assetVersionId, partNumbers: $partNumbers) {
      partNumber
      url
      expiresAt
    }
  }
`);

export const completeUploadDocument = graphql(`
  mutation CompleteUpload($input: CompleteUploadInput!) {
    completeUpload(input: $input) {
      id
    }
  }
`);

export const abortUploadDocument = graphql(`
  mutation AbortUpload($assetVersionId: ID!) {
    abortUpload(assetVersionId: $assetVersionId)
  }
`);

/** The upload mutations bound to the browser's gateway endpoint (see `MultipartUploader`). */
export function createUploadApi(endpoint: string): UploadApi {
  return {
    initiate: async (input) =>
      (
        await executeGraphql({
          endpoint,
          document: initiateUploadDocument,
          variables: { input },
        })
      ).initiateUpload,
    renewPartUrls: async (assetVersionId, partNumbers) =>
      (
        await executeGraphql({
          endpoint,
          document: renewUploadPartUrlsDocument,
          variables: {
            assetVersionId,
            partNumbers,
          },
        })
      ).renewUploadPartUrls,
    complete: async (assetVersionId, parts) => {
      await executeGraphql({
        endpoint,
        document: completeUploadDocument,
        variables: {
          input: {
            assetVersionId,
            parts,
          },
        },
      });
    },
    abort: async (assetVersionId) => {
      await executeGraphql({
        endpoint,
        document: abortUploadDocument,
        variables: { assetVersionId },
      });
    },
  };
}
