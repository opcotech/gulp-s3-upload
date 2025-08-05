# @opcotech/gulp-s3-upload

This plugin uses the AWS SDK v3 to upload files to S3 with support for optional features like automatic content type detection, metadata settings, and Cache-Control headers.

## Installation

```bash
npm install @opcotech/gulp-s3-upload --save-dev
# or
pnpm add @opcotech/gulp-s3-upload -D
# or
yarn add @opcotech/gulp-s3-upload --dev
```

## AWS Configuration

This plugin requires AWS credentials. You can provide them in several ways:

1. **Environment variables**:

    ```
    AWS_ACCESS_KEY_ID=your-access-key
    AWS_SECRET_ACCESS_KEY=your-secret-key
    AWS_REGION=us-east-1
    ```

2. **AWS shared credentials file (~/.aws/credentials)**:

    ```
    [default]
    aws_access_key_id = your-access-key
    aws_secret_access_key = your-secret-key
    region = us-east-1
    ```

3. **Directly in the plugin options** (not recommended for production):
    ```javascript
    const s3 = s3Upload({
        accessKeyId: "access-key-id",
        secretAccessKey: "secret-access-key",
        region: "region",
    });
    ```

## LocalStack Support

For development and testing purposes, you can use LocalStack to simulate AWS S3 locally. The plugin supports LocalStack through standard S3 configuration options:

### Basic LocalStack Usage

```javascript
const s3 = s3Upload(
    {
        accessKeyId: "test",
        secretAccessKey: "test",
    },
    {
        endpoint: "http://localhost:4566",
        forcePathStyle: true,
    },
);
```

### Custom LocalStack Configuration

```javascript
const s3 = s3Upload(
    {
        accessKeyId: "custom-key",
        secretAccessKey: "custom-secret",
    },
    {
        endpoint: "http://localhost:9000", // Custom endpoint
        forcePathStyle: false, // Custom path style setting
        region: "us-east-1",
    },
);
```

### LocalStack with IAM

```javascript
const s3 = s3Upload(
    {
        useIAM: true,
    },
    {
        endpoint: "http://localhost:4566",
        forcePathStyle: true,
    },
);
```

**Common LocalStack Settings:**
- Endpoint: `http://localhost:4566` (default LocalStack port)
- Force Path Style: `true` (recommended for LocalStack)
- Credentials: `accessKeyId: "test"`, `secretAccessKey: "test"` (LocalStack defaults)

**Benefits of this approach:**
- No special LocalStack-specific options required
- Works with any S3-compatible service (LocalStack, MinIO, etc.)
- Uses standard AWS SDK v3 configuration patterns
- Maintains full backward compatibility

## Basic Usage

```javascript
import gulp from "gulp";
import s3Upload from "@opcotech/gulp-s3-upload";

const s3 = s3Upload({
    accessKeyId: "access-key-id",
    secretAccessKey: "secret-access-key",
    region: "region",
});

export function uploadAssets() {
    return gulp.src("./dist/**/*").pipe(
        s3({
            Bucket: "my-bucket",
        }),
    );
}
```

## Examples

### Basic Upload with Key Transformation

```javascript
gulp.src("./dist/**/*").pipe(
    s3({
        Bucket: "my-bucket",
        ACL: "public-read",
        keyTransform: function (filename) {
            return "production/assets/" + filename;
        },
    }),
);
```

### Setting Cache Headers and Metadata

```javascript
gulp.src("./dist/images/**/*.{jpg,png,gif}").pipe(
    s3({
        Bucket: "my-bucket",
        ACL: "public-read",
        cacheControl: "max-age=31536000, public",
        metadataTransform: function (file) {
            return {
                "x-amz-meta-uploaded-date": new Date().toISOString(),
                "x-amz-meta-original-path": file.path,
            };
        },
    }),
);
```

### Development vs Production Configuration

```javascript
import gulp from "gulp";
import s3Upload from "@opcotech/gulp-s3-upload";

// Development configuration with LocalStack
const s3Dev = s3Upload(
    {
        accessKeyId: "test",
        secretAccessKey: "test",
    },
    {
        endpoint: "http://localhost:4566",
        forcePathStyle: true,
    },
);

// Production configuration with AWS
const s3Prod = s3Upload({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

export function uploadAssetsDev() {
    return gulp.src("./dist/**/*").pipe(
        s3Dev({
            Bucket: "my-dev-bucket",
        }),
    );
}

export function uploadAssetsProd() {
    return gulp.src("./dist/**/*").pipe(
        s3Prod({
            Bucket: "my-production-bucket",
        }),
    );
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

The following projects had a great influence on this package:

- https://github.com/clineamb/gulp-s3-upload
