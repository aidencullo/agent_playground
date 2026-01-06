#!/usr/bin/env bun

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { readdir } from 'fs/promises'
import { join, relative } from 'path'
import { readFileSync, statSync } from 'fs'
import { lookup } from 'mime-types'

const BUCKET_NAME = process.env.AWS_S3_BUCKET
const CLOUDFRONT_DISTRIBUTION_ID = process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

if (!BUCKET_NAME) {
  console.error('❌ AWS_S3_BUCKET environment variable is required')
  process.exit(1)
}

const s3Client = new S3Client({ region: AWS_REGION })
const cloudFrontClient = new CloudFrontClient({ region: AWS_REGION })

async function getAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath, baseDir)))
    } else {
      files.push(relative(baseDir, fullPath))
    }
  }

  return files
}

async function uploadFile(filePath: string, distDir: string) {
  const fullPath = join(distDir, filePath)
  const fileContent = readFileSync(fullPath)
  const contentType = lookup(filePath) || 'application/octet-stream'

  const params = {
    Bucket: BUCKET_NAME,
    Key: filePath,
    Body: fileContent,
    ContentType: contentType,
    CacheControl: filePath.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'  // 1 year for hashed assets
      : 'public, max-age=0, must-revalidate',   // No cache for HTML
  }

  await s3Client.send(new PutObjectCommand(params))
  console.log(`✓ Uploaded: ${filePath}`)
}

async function clearBucket() {
  console.log('\n🗑️  Clearing existing files in S3 bucket...')

  const listParams = {
    Bucket: BUCKET_NAME,
  }

  const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams))

  if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
    console.log('  Bucket is already empty')
    return
  }

  const deleteParams = {
    Bucket: BUCKET_NAME,
    Delete: {
      Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key })),
    },
  }

  await s3Client.send(new DeleteObjectsCommand(deleteParams))
  console.log(`  Deleted ${listedObjects.Contents.length} files`)
}

async function invalidateCloudFront() {
  if (!CLOUDFRONT_DISTRIBUTION_ID) {
    console.log('\n⚠️  Skipping CloudFront invalidation (AWS_CLOUDFRONT_DISTRIBUTION_ID not set)')
    return
  }

  console.log('\n☁️  Creating CloudFront invalidation...')

  const params = {
    DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
    InvalidationBatch: {
      CallerReference: `deploy-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: ['/*'],
      },
    },
  }

  const result = await cloudFrontClient.send(new CreateInvalidationCommand(params))
  console.log(`✓ Invalidation created: ${result.Invalidation?.Id}`)
}

async function deploy() {
  const distDir = join(process.cwd(), 'dist')

  try {
    statSync(distDir)
  } catch {
    console.error('❌ Build directory not found. Run "bun run build" first.')
    process.exit(1)
  }

  console.log('🚀 Starting deployment...')
  console.log(`📦 Bucket: ${BUCKET_NAME}`)
  console.log(`🌍 Region: ${AWS_REGION}`)

  await clearBucket()

  console.log('\n📤 Uploading files...')
  const files = await getAllFiles(distDir)

  for (const file of files) {
    await uploadFile(file, distDir)
  }

  console.log(`\n✅ Uploaded ${files.length} files to S3`)

  await invalidateCloudFront()

  console.log('\n🎉 Deployment complete!')
  console.log(`🔗 Your site is available at: https://${BUCKET_NAME}.s3-website-${AWS_REGION}.amazonaws.com`)

  if (CLOUDFRONT_DISTRIBUTION_ID) {
    console.log('🔗 CloudFront URL: Check your CloudFront distribution for the CDN URL')
  }
}

deploy().catch((error) => {
  console.error('❌ Deployment failed:', error)
  process.exit(1)
})
