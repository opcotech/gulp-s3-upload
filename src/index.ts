import { HeadObjectCommand, HeadObjectCommandOutput, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import colors from "ansi-colors";
import eventStream, { MapStream } from "event-stream";
import fancyLog from "fancy-log";
import { hash as hasha } from "hasha";
import mime from "mime";
import { basename, dirname, extname, join } from "path";
import PluginError from "plugin-error";
import { Readable } from "stream";
import File from "vinyl";

const PLUGIN_NAME = "gulp-s3-upload";

interface S3UploadOptions {
  Bucket?: string;
  bucket?: string;
  keyTransform?: (filename: string) => string;
  nameTransform?: (filename: string) => string;
  mimeTypeLookup?: (keyname: string) => string;
  charset?: string;
  metadataMap?: Record<string, string> | ((keyname: string) => Record<string, string>);
  manualContentEncoding?: string | ((keyname: string) => string);
  etag_hash?: string;
  uploadNewFilesOnly?: boolean;
  onNoChange?: (keyname: string) => void;
  onNew?: (keyname: string) => void;
  maps?: Record<string, (keyname: string) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  verbose?: boolean;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface S3Credentials extends AwsCredentialIdentity {
  useIAM?: boolean;
  region?: string;
}

interface S3Config {
  region?: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface ParsedPath {
  dirname: string;
  basename: string;
  extname: string;
}

/**
 * Build path from director and file name
 */
function buildName(dirs: string, filename: string): string {
  return join(dirs, filename);
}

/**
 * Filter out option keys from the input params
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterOptions(params: Record<string, any>): Record<string, any> {
  const keysToOmit = new Set<string>(["Body", "bucket", "charset", "ContentType", "etag_hash", "Key", "keyTransform", "metadataMap", "manualContentEncoding", "maps", "mimeTypeLookup", "nameTransform", "onChange", "onNoChange", "onNew", "uploadNewFilesOnly", "verbose"]);

  return Object.fromEntries(Object.entries(params).filter(([key]) => !keysToOmit.has(key)));
}

/**
 * Parese a detailed path object from the input string
 */
function parsePath(path: string): ParsedPath {
  const ext = extname(path);

  return {
    dirname: dirname(path),
    basename: basename(path, ext),
    extname: ext,
  };
}

/**
 * Generate a keyname for S3 object based on file path
 */
function generateKeyname(file: File, options: S3UploadOptions): string {
  const keyTransform = options.keyTransform || options.nameTransform;
  return keyTransform ? keyTransform(file.relative) : buildName(parsePath(file.relative).dirname, parsePath(file.relative).basename + parsePath(file.relative).extname).replace(/\\/g, "/");
}

/**
 * Determine MIME type for the file
 */
function determineMimeType(keyname: string, options: S3UploadOptions): string {
  let mimetype;

  if (options.mimeTypeLookup) {
    mimetype = options.mimeTypeLookup(keyname);
  } else {
    mimetype = mime.getType(keyname) || "application/octet-stream";
  }

  if (options.charset) {
    mimetype += `;charset=${options.charset}`;
  }
  return mimetype;
}

/**
 * Check if a file already exists in S3 and if it's changed
 */
async function checkFileExists(
  s3: S3Client,
  bucket: string,
  keyname: string,
  file: File,
  options: S3UploadOptions,
): Promise<{
  shouldUpload: boolean;
  headData: HeadObjectCommandOutput | null;
}> {
  let shouldUpload = true;
  let headData: HeadObjectCommandOutput | null = null;

  try {
    headData = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: keyname }));

    const noHash = file.isStream() || options.etag_hash === "none";
    if (!noHash && file.isBuffer()) {
      const hash = await hasha(file.contents as Buffer, {
        algorithm: options.etag_hash || "md5",
      });
      const etag = headData.ETag?.replace(/^"(.*)"$/, "$1");

      if (etag === hash) {
        fancyLog(colors.gray("No Change ... "), keyname);
        if (options.onNoChange && typeof options.onNoChange === "function") {
          options.onNoChange(keyname);
        }
        return { shouldUpload: false, headData };
      }
    }

    if (options.uploadNewFilesOnly) {
      shouldUpload = false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (headErr: any) {
    if (headErr.name !== "NotFound" && headErr.name !== "Forbidden") {
      throw new PluginError(PLUGIN_NAME, `S3 headObject Error: ${headErr.stack}`);
    }
  }

  return { shouldUpload, headData };
}

/**
 * Prepare upload parameters for S3
 */
function prepareUploadParameters(file: File, bucket: string, keyname: string, mimetype: string, options: S3UploadOptions): PutObjectCommandInput {
  const metadata = typeof options.metadataMap === "function" ? options.metadataMap(keyname) : options.metadataMap;

  const contentEncoding = typeof options.manualContentEncoding === "function" ? options.manualContentEncoding(keyname) : options.manualContentEncoding;

  if (file.contents === null) {
    throw new PluginError(PLUGIN_NAME, "File contents cannot be null");
  }

  const objOpts: PutObjectCommandInput = {
    ...filterOptions(options),
    Bucket: bucket,
    Key: keyname,
    ContentType: mimetype,
    Metadata: metadata,
    ContentEncoding: contentEncoding,
  };

  if (file.isBuffer()) {
    objOpts.Body = file.contents as Buffer;
  } else if (file.isStream()) {
    objOpts.Body = file.contents as unknown as Readable;

    if (file.stat) {
      objOpts.ContentLength = file.stat.size;
    } else {
      throw new PluginError(PLUGIN_NAME, "S3 Upload of streamObject must have a ContentLength");
    }
  }

  if (options.maps) {
    Object.entries(options.maps).forEach(([paramName, mapRoutine]) => {
      if (typeof mapRoutine === "function") {
        (objOpts as any)[paramName] = mapRoutine(keyname); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    });
  }

  return objOpts;
}

/**
 * Upload a file to S3
 */
async function uploadFileToS3(s3: S3Client, params: PutObjectCommandInput, keyname: string, options: S3UploadOptions): Promise<void> {
  fancyLog(colors.yellow("Uploading ... "), keyname);

  const uploadS3 = new Upload({
    client: s3,
    queueSize: 4,
    leavePartsOnError: false,
    params,
  });

  await uploadS3.done();
  fancyLog(colors.green("Uploaded! ... "), keyname);

  if (options.onNew && typeof options.onNew === "function") {
    options.onNew(keyname);
  }
}

/**
 * Process a single file for S3 upload
 */
async function processFile(s3: S3Client, file: File, bucket: string, options: S3UploadOptions): Promise<void> {
  if (file.isNull()) {
    return;
  }

  const keyname = generateKeyname(file, options);
  const mimetype = determineMimeType(keyname, options);

  const { shouldUpload } = await checkFileExists(s3, bucket, keyname, file, options);

  if (!shouldUpload) {
    fancyLog(colors.gray("Skipping upload of existing file ... "), keyname);
    return;
  }

  const uploadParams = prepareUploadParameters(file, bucket, keyname, mimetype, options);

  await uploadFileToS3(s3, uploadParams, keyname, options);
}

/**
 * Create a S3 client with the given credentials
 */
function createS3Client(credentials: AwsCredentialIdentity, s3Config: S3Config = {}): S3Client {
  return new S3Client({
    ...s3Config,
    credentials,
  });
}

/**
 * Create a gulp plugin that uploads files to S3
 */
const gulpPrefixer =
  (s3: S3Client) =>
  (options: S3UploadOptions): MapStream => {
    const bucket = options.Bucket || options.bucket;

    if (!bucket) {
      throw new PluginError(PLUGIN_NAME, "Missing S3 bucket name!");
    }

    return eventStream.map(
      async (
        file: File,
        callback: (error?: Error | null, data?: any) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
      ) => {
        try {
          await processFile(s3, file, bucket, options);
          callback(null, file);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          callback(new PluginError(PLUGIN_NAME, err));
        }
      },
    );
  };

/**
 * Main export function that creates an S3 upload gulp plugin
 */
export default function (credentialsOrConfig: Partial<S3Credentials> = {}, s3Config: S3Config = {}) {
  if (credentialsOrConfig.region) {
    s3Config.region = credentialsOrConfig.region;
    delete credentialsOrConfig.region;
  }

  const credentials: Partial<AwsCredentialIdentity> = credentialsOrConfig.useIAM ? {} : { ...credentialsOrConfig };

  const s3 = createS3Client(credentials as AwsCredentialIdentity, s3Config);

  return gulpPrefixer(s3);
}
