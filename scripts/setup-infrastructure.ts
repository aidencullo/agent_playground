#!/usr/bin/env bun

import {
  S3Client,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand
} from '@aws-sdk/client-s3'
import {
  CloudFrontClient,
  CreateDistributionCommand,
  DistributionConfig
} from '@aws-sdk/client-cloudfront'

const BUCKET_NAME = process.env.AWS_S3_BUCKET || `react-app-${Date.now()}`
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'

const s3Client = new S3Client({ region: AWS_REGION })
const cloudFrontClient = new CloudFrontClient({ region: 'us-east-1' }) // CloudFront is always us-east-1

async function createS3Bucket() {
  console.log('\n📦 Creating S3 bucket...')
  console.log(`   Bucket name: ${BUCKET_NAME}`)
  console.log(`   Region: ${AWS_REGION}`)

  try {
    // Create bucket
    const createParams: any = {
      Bucket: BUCKET_NAME,
    }

    // Only add LocationConstraint if not us-east-1
    if (AWS_REGION !== 'us-east-1') {
      createParams.CreateBucketConfiguration = {
        LocationConstraint: AWS_REGION,
      }
    }

    await s3Client.send(new CreateBucketCommand(createParams))
    console.log('✓ Bucket created')

    // Disable public access block (we'll use bucket policy instead)
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: BUCKET_NAME,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }))
    console.log('✓ Public access configured')

    // Configure static website hosting
    await s3Client.send(new PutBucketWebsiteCommand({
      Bucket: BUCKET_NAME,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: { Key: 'index.html' }, // For SPA routing
      },
    }))
    console.log('✓ Static website hosting enabled')

    // Set bucket policy for public read access
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
        },
      ],
    }

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy),
    }))
    console.log('✓ Bucket policy set for public read access')

    return BUCKET_NAME
  } catch (error: any) {
    if (error.name === 'BucketAlreadyOwnedByYou') {
      console.log('✓ Bucket already exists and is owned by you')
      return BUCKET_NAME
    }
    throw error
  }
}

async function createCloudFrontDistribution(bucketName: string) {
  console.log('\n☁️  Creating CloudFront distribution...')

  const websiteEndpoint = `${bucketName}.s3-website-${AWS_REGION}.amazonaws.com`

  const distributionConfig: DistributionConfig = {
    CallerReference: `${bucketName}-${Date.now()}`,
    Comment: `CDN for ${bucketName}`,
    Enabled: true,
    DefaultRootObject: 'index.html',
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: 'S3-Website',
          DomainName: websiteEndpoint,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: 'http-only',
          },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: 'S3-Website',
      ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'],
      },
      CachedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'],
      },
      ForwardedValues: {
        QueryString: false,
        Cookies: {
          Forward: 'none',
        },
      },
      MinTTL: 0,
      DefaultTTL: 86400,
      MaxTTL: 31536000,
      Compress: true,
    },
    CustomErrorResponses: {
      Quantity: 1,
      Items: [
        {
          ErrorCode: 404,
          ResponsePagePath: '/index.html',
          ResponseCode: '200',
          ErrorCachingMinTTL: 300,
        },
      ],
    },
    PriceClass: 'PriceClass_100', // Use only North America and Europe edge locations (cheapest)
  }

  try {
    const result = await cloudFrontClient.send(
      new CreateDistributionCommand({ DistributionConfig: distributionConfig })
    )

    console.log('✓ CloudFront distribution created')
    console.log(`   Distribution ID: ${result.Distribution?.Id}`)
    console.log(`   Domain Name: ${result.Distribution?.DomainName}`)
    console.log('   Status: Deploying (this may take 15-20 minutes)')

    return {
      id: result.Distribution?.Id,
      domainName: result.Distribution?.DomainName,
    }
  } catch (error: any) {
    console.error('❌ Failed to create CloudFront distribution:', error.message)
    console.log('   You can create it manually or skip this step')
    return null
  }
}

async function setupInfrastructure() {
  console.log('🏗️  Setting up AWS infrastructure for S3 + CloudFront deployment')
  console.log('=' .repeat(60))

  try {
    // Create S3 bucket
    const bucketName = await createS3Bucket()

    // Create CloudFront distribution
    const cloudFront = await createCloudFrontDistribution(bucketName)

    console.log('\n' + '='.repeat(60))
    console.log('✅ Infrastructure setup complete!')
    console.log('=' .repeat(60))
    console.log('\n📝 Add these to your .env file:\n')
    console.log(`AWS_S3_BUCKET=${bucketName}`)
    console.log(`AWS_REGION=${AWS_REGION}`)

    if (cloudFront) {
      console.log(`AWS_CLOUDFRONT_DISTRIBUTION_ID=${cloudFront.id}`)
      console.log(`\n🌐 Your CloudFront URL: https://${cloudFront.domainName}`)
      console.log('   (Will be available after CloudFront deployment completes)')
    }

    console.log(`\n🔗 S3 Website URL: http://${bucketName}.s3-website-${AWS_REGION}.amazonaws.com`)
    console.log('\n💡 Next steps:')
    console.log('   1. Create .env file with the values above')
    console.log('   2. Run: bun run build')
    console.log('   3. Run: bun run deploy')
    console.log('\n')
  } catch (error) {
    console.error('\n❌ Infrastructure setup failed:', error)
    process.exit(1)
  }
}

setupInfrastructure()
