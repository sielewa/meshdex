#!/bin/sh
# Creates the assets bucket and the CORS rules the browser needs for direct
# (presigned) multipart uploads. Idempotent: safe to run on every `compose up`.
set -eu

s3api() {
  aws --endpoint-url "$S3_ENDPOINT" s3api "$@"
}

attempt=0
until s3api list-buckets > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "S3 endpoint $S3_ENDPOINT not reachable" >&2
    exit 1
  fi
  sleep 1
done

if s3api head-bucket --bucket "$S3_BUCKET" > /dev/null 2>&1; then
  echo "Bucket $S3_BUCKET already exists"
else
  s3api create-bucket --bucket "$S3_BUCKET"
  echo "Bucket $S3_BUCKET created"
fi

# ExposeHeaders ETag: after uploading each part the browser must read its ETag,
# because CompleteMultipartUpload needs the list of (PartNumber, ETag) pairs.
s3api put-bucket-cors --bucket "$S3_BUCKET" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [\"$WEB_ORIGIN\"],
    \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
    \"AllowedHeaders\": [\"*\"],
    \"ExposeHeaders\": [\"ETag\"],
    \"MaxAgeSeconds\": 3600
  }]
}"
echo "CORS for $S3_BUCKET set to origin $WEB_ORIGIN"
