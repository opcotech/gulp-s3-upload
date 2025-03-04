import S3Uploader from "../src/index";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import File from "vinyl";
import { Readable } from "stream";
import * as fs from "fs";
import eventStream from "event-stream";

// Mock for S3Client
const mockS3Send = jest.fn().mockImplementation((command) => {
  if (command instanceof HeadObjectCommand) {
    return Promise.reject({ name: "NotFound" });
  }
  return Promise.resolve({});
});

const mockS3Client = {
  send: mockS3Send,
};

jest.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: jest.fn(() => mockS3Client),
    HeadObjectCommand: jest.fn(),
  };
});

// Mock for Upload
const mockUploadDone = jest.fn().mockResolvedValue({});
const mockUploadInstance = {
  done: mockUploadDone,
};

jest.mock("@aws-sdk/lib-storage", () => {
  return {
    Upload: jest.fn(() => mockUploadInstance),
  };
});

jest.mock("mime", () => ({
  getType: jest.fn((path: string) => {
    if (path.endsWith(".txt")) return "text/plain";
    if (path.endsWith(".json")) return "application/json";
    return "application/octet-stream";
  }),
}));

jest.mock("hasha", () => ({
  hash: jest.fn().mockReturnValue("5a105e8b9d40e1329780d62ea2265d8a"),
}));

describe("gulp-s3-upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initialization", () => {
    test("should create uploader with credentials", () => {
      S3Uploader({
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      });

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: expect.objectContaining({
            accessKeyId: "test-key",
            secretAccessKey: "test-secret",
          }),
        }),
      );
    });

    test("should use IAM credentials when useIAM is set", () => {
      S3Uploader({ useIAM: true });

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {},
        }),
      );
    });

    test("should move region from credentials to config", () => {
      S3Uploader({ region: "us-west-2" });

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "us-west-2",
          credentials: expect.not.objectContaining({ region: "us-west-2" }),
        }),
      );
    });

    test("should throw error when bucket is not provided", () => {
      const uploader = S3Uploader({});

      expect(() => {
        uploader({});
      }).toThrow("Missing S3 bucket name!");
    });
  });

  describe("file processing", () => {
    let uploader: ReturnType<typeof S3Uploader>;

    beforeEach(() => {
      uploader = S3Uploader({ accessKeyId: "test", secretAccessKey: "test" });
    });

    test("should upload a buffer file", (done) => {
      jest.clearAllMocks();

      const s3Stream = uploader({ bucket: "test-bucket" });
      const contents = Buffer.from("test file contents");
      const file = new File({
        path: "test/file.txt",
        contents,
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).toHaveBeenCalled();
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                Bucket: "test-bucket",
                Key: "test/file.txt",
                ContentType: "text/plain",
                Body: contents,
              }),
            }),
          );
          expect(mockUploadDone).toHaveBeenCalled();
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should upload a stream file", (done) => {
      jest.clearAllMocks();

      const s3Stream = uploader({ bucket: "test-bucket" });
      const fileContents = Readable.from(["test file contents"]);
      const file = new File({
        path: "test/file.txt",
        contents: fileContents,
        stat: { size: 100 } as fs.Stats,
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).toHaveBeenCalled();
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                Bucket: "test-bucket",
                Key: "test/file.txt",
                ContentType: "text/plain",
                Body: fileContents,
                ContentLength: 100,
              }),
            }),
          );
          expect(mockUploadDone).toHaveBeenCalled();
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should not upload null files", (done) => {
      jest.clearAllMocks();

      const s3Stream = uploader({ bucket: "test-bucket" });
      const file = new File({
        path: "test/file.txt",
        contents: null,
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).not.toHaveBeenCalled();
          expect(mockUploadDone).not.toHaveBeenCalled();
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should use keyTransform function if provided", (done) => {
      jest.clearAllMocks();

      const keyTransform = jest.fn().mockReturnValue("transformed/path.txt");
      const s3Stream = uploader({
        bucket: "test-bucket",
        keyTransform,
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(keyTransform).toHaveBeenCalledWith("test/file.txt");
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                Key: "transformed/path.txt",
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should use custom mime type lookup if provided", (done) => {
      jest.clearAllMocks();

      const mimeTypeLookup = jest.fn().mockReturnValue("application/json");
      const s3Stream = uploader({
        bucket: "test-bucket",
        mimeTypeLookup,
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(mimeTypeLookup).toHaveBeenCalledWith("test/file.txt");
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                ContentType: "application/json",
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should add charset if provided", (done) => {
      jest.clearAllMocks();

      const s3Stream = uploader({
        bucket: "test-bucket",
        charset: "utf-8",
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                ContentType: "text/plain;charset=utf-8",
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should use metadataMap if provided", (done) => {
      jest.clearAllMocks();

      const metadata = { custom: "value" };
      const s3Stream = uploader({
        bucket: "test-bucket",
        metadataMap: metadata,
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                Metadata: metadata,
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should use metadataMap function if provided", (done) => {
      jest.clearAllMocks();

      const metadataFn = jest.fn().mockReturnValue({ custom: "generated" });
      const s3Stream = uploader({
        bucket: "test-bucket",
        metadataMap: metadataFn,
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(metadataFn).toHaveBeenCalledWith("test/file.txt");
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                Metadata: { custom: "generated" },
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should skip upload if file exists and is unchanged", (done) => {
      jest.clearAllMocks();

      mockS3Send.mockResolvedValueOnce({
        ETag: '"5a105e8b9d40e1329780d62ea2265d8a"',
      });

      const s3Stream = uploader({
        bucket: "test-bucket",
        etag_hash: "md5",
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(Upload).not.toHaveBeenCalled();
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should call onNew callback if file is uploaded", (done) => {
      jest.clearAllMocks();

      const onNew = jest.fn();
      const s3Stream = uploader({
        bucket: "test-bucket",
        onNew,
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(onNew).toHaveBeenCalledWith("test/file.txt");
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);

    test("should apply custom maps to upload parameters", (done) => {
      jest.clearAllMocks();

      const cacheDays = jest.fn().mockReturnValue(7);
      const s3Stream = uploader({
        bucket: "test-bucket",
        maps: {
          CacheControl: (keyname: string) => `max-age=${cacheDays(keyname) * 86400}`,
        },
      });

      const file = new File({
        path: "test/file.txt",
        contents: Buffer.from("test"),
      });

      s3Stream.once("data", () => {
        try {
          expect(cacheDays).toHaveBeenCalledWith("test/file.txt");
          expect(Upload).toHaveBeenCalledWith(
            expect.objectContaining({
              params: expect.objectContaining({
                CacheControl: "max-age=604800",
              }),
            }),
          );
          done();
        } catch (err) {
          done(err);
        }
      });

      s3Stream.write(file);
    }, 5000);
  });
});
