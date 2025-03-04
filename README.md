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

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

The following projects had a great influence on this package:

- https://github.com/clineamb/gulp-s3-upload
