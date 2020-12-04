const AWS = require('aws-sdk');
const { FailedToCopyFileError } = require('../common/errors');
const { s3: config, origin } = require('../config');

const buildTmpKey = key => `tmp/${key}`;

const isTmpKey = key => /^tmp\//.test(key);

const getKeyFromTmpKey = tmpKey => tmpKey.replace(/^tmp\//, '');

const getReceiptPhotoUrlFromKey = key => `${origin}/${key}`;

const createFileService = ({ s3Config } = { s3Config: config }) => {
  const s3 = new AWS.S3(s3Config);

  const upload = (key, data, mimetype) =>
    new Promise((resolve, reject) => {
      s3.upload(
        {
          Key: key,
          Bucket: s3Config.bucket,
          Body: data,
          ContentType: mimetype,
        },
        err => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });

  const httpGet = (key, options, callback) => {
    s3.getObject(
      {
        Key: key,
        Bucket: s3Config.bucket,
      },
      function handleGetObject(err, data) {
        const {
          httpResponse: { statusCode },
        } = this;
        const { Body, ContentType } = data || {};

        callback(err, {
          body: Body,
          contentType: ContentType,
          statusCode,
        });
      },
    );
  };

  const createPresignedPostData = ({
    key,
    urlExpiresIn = 100 * 60 * 1000, // 10 minutes,
    contentLengthRange,
    contentType,
  }) =>
    new Promise((resolve, reject) => {
      const params = {
        Key: key,
        Bucket: s3Config.bucket,
        Expires: urlExpiresIn,
        Conditions: [],
        Fields: {
          key,
        },
      };

      if (contentType) {
        params.Fields['Content-Type'] = contentType;
      }

      if (contentLengthRange) {
        params.Conditions.push([
          'content-length-range',
          contentLengthRange[0],
          contentLengthRange[1],
        ]);
      }

      s3.createPresignedPost(params, (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(data);
      });
    });

  const copy = ({ from, to }) => {
    const params = {
      Bucket: s3Config.bucket,
      CopySource: `${s3Config.bucket}/${from.key}`,
      Key: to.key,
    };
    return new Promise((resolve, reject) => {
      s3.copyObject(params, (originalError, data) => {
        if (originalError) {
          const error = new FailedToCopyFileError({ details: originalError });
          reject(error);
          return;
        }
        resolve(data);
      });
    });
  };

  return {
    upload,
    httpGet,
    createPresignedPostData,
    buildTmpKey,
    isTmpKey,
    getKeyFromTmpKey,
    copy,
  };
};

module.exports = {
  createFileService,
  buildTmpKey,
  isTmpKey,
  getKeyFromTmpKey,
  getReceiptPhotoUrlFromKey,
};
