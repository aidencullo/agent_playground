# React App with S3 + CloudFront Deployment

A React application with automated deployment to AWS S3 and CloudFront CDN. This setup provides the cheapest, fastest, and simplest way to deploy a single-page application with HTTPS, global caching, and CDN distribution.

## Features

- ⚡ React 19 + Vite for blazing fast development
- 🏃 Bun runtime for fast package management
- ☁️ AWS S3 for static hosting
- 🌐 CloudFront CDN for global distribution
- 🔒 HTTPS with CloudFront
- 📦 Automated deployment scripts
- 💰 Cost-optimized (minimal AWS costs)

## Quick Start

### Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev
```

Visit http://localhost:5173

### Build

```bash
bun run build
```

## AWS Deployment Setup

### Prerequisites

1. AWS account with CLI configured
2. AWS credentials set up (via `aws configure` or environment variables)

### Option 1: Automated Infrastructure Setup

Run the automated setup script to create S3 bucket and CloudFront distribution:

```bash
# Set your desired bucket name (optional)
export AWS_S3_BUCKET=my-app-name
export AWS_REGION=us-east-1

# Run setup script
bun run setup-aws
```

The script will:
- Create an S3 bucket with static website hosting
- Configure bucket for public read access
- Create a CloudFront distribution
- Output configuration values

Copy the output values to a `.env` file.

### Option 2: Manual Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your AWS details in `.env`:
   ```
   AWS_S3_BUCKET=your-bucket-name
   AWS_REGION=us-east-1
   AWS_CLOUDFRONT_DISTRIBUTION_ID=your-distribution-id
   ```

3. Create S3 bucket manually via AWS Console or CLI
4. Create CloudFront distribution pointing to S3 bucket

## Deployment

Once configured, deploy with a single command:

```bash
# Build and deploy
bun run build && bun run deploy
```

The deployment script will:
- Clear existing files in S3
- Upload all build files
- Set proper cache headers (1 year for assets, no cache for HTML)
- Invalidate CloudFront cache (if configured)

## Cost Optimization

This setup is optimized for minimal AWS costs:

- **S3**: Pay only for storage and requests (~$0.50/month for typical SPA)
- **CloudFront**: Free tier covers 1TB/month for first year, then ~$0.085/GB
- **PriceClass_100**: Uses only NA/EU edge locations (cheapest tier)
- **Cache optimization**: Immutable assets cached for 1 year

## Architecture

```
User Request
    ↓
CloudFront CDN (HTTPS, Caching)
    ↓
S3 Bucket (Static Files)
```

### Benefits

1. **Fast**: Content served from edge locations worldwide
2. **Cheap**: No servers to run, pay only for storage and bandwidth
3. **Simple**: No complex server configuration or maintenance
4. **Scalable**: Automatically handles traffic spikes
5. **Secure**: HTTPS by default with CloudFront

## Project Structure

```
├── src/              # React source files
├── scripts/          # Deployment scripts
│   ├── deploy.ts                # S3 upload script
│   └── setup-infrastructure.ts  # AWS setup automation
├── dist/             # Build output (generated)
├── .env.example      # Environment template
└── vite.config.ts    # Vite configuration
```

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build locally
- `bun run setup-aws` - Create AWS infrastructure
- `bun run deploy` - Deploy to S3 + CloudFront
- `bun run test` - Run tests

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_S3_BUCKET` | Yes | S3 bucket name |
| `AWS_REGION` | No | AWS region (default: us-east-1) |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | No | CloudFront distribution ID for cache invalidation |
| `AWS_ACCESS_KEY_ID` | No | AWS access key (if not using CLI profile) |
| `AWS_SECRET_ACCESS_KEY` | No | AWS secret key (if not using CLI profile) |

## Troubleshooting

### Deployment fails with 403 error
- Check AWS credentials are configured correctly
- Verify bucket name is unique and available
- Ensure IAM user has S3 and CloudFront permissions

### CloudFront not serving latest version
- CloudFront caching can take 15-20 minutes to propagate
- Cache invalidation is automatic if `AWS_CLOUDFRONT_DISTRIBUTION_ID` is set
- Manual invalidation: AWS Console → CloudFront → Create Invalidation → `/*`

### SPA routes return 404
- CloudFront custom error response redirects 404 to index.html
- Verify CloudFront distribution has custom error response configured

## License

MIT
