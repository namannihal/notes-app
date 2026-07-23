import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { env } from '../env.js';

const credential = new StorageSharedKeyCredential(
  env.AZURE_STORAGE_ACCOUNT,
  env.AZURE_STORAGE_KEY,
);

const serviceClient = new BlobServiceClient(
  `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
  credential,
);

const containerClient = serviceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER);

/** Ensure the container exists (private access). Call once at startup. */
export async function ensureContainer(): Promise<void> {
  await containerClient.createIfNotExists();
}

const SAS_TTL_MS = 10 * 60 * 1000; // 10 minutes

function sasUrl(blobName: string, permissions: string): string {
  const now = Date.now();
  const sas = generateBlobSASQueryParameters(
    {
      containerName: env.AZURE_STORAGE_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn: new Date(now - 60 * 1000),
      expiresOn: new Date(now + SAS_TTL_MS),
    },
    credential,
  ).toString();
  return `${containerClient.getBlockBlobClient(blobName).url}?${sas}`;
}

/** Short-lived URL the client uses to PUT bytes directly to Azure. */
export function uploadUrl(blobName: string): string {
  return sasUrl(blobName, 'cw');
}

/** Short-lived read URL for downloading/viewing a blob. */
export function downloadUrl(blobName: string): string {
  return sasUrl(blobName, 'r');
}

export async function deleteBlob(blobName: string): Promise<void> {
  await containerClient.getBlockBlobClient(blobName).deleteIfExists();
}

/** Content-addressed key: dedupes identical bytes across notes. */
export function blobKeyFor(userId: string, checksum: string): string {
  return `${userId}/${checksum}`;
}

/** Server-side upload used by ENEX import (bytes already in memory). */
export async function uploadBytes(
  blobName: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await containerClient.getBlockBlobClient(blobName).uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}
