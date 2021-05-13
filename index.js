const core = require('@actions/core');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const AWS_KEY_ID = core.getInput('aws_key_id', {
  required: true
});
const SECRET_ACCESS_KEY = core.getInput('aws_secret_access_key', {
  required: true
});
const BUCKET = core.getInput('aws_bucket', {
  required: true
});
const SOURCE_DIR = core.getInput('source_dir', {
  required: true
});
const DESTINATION_DIR = core.getInput('destination_dir', {
  required: false
});

const s3 = new S3({
  accessKeyId: AWS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY
});
const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;
const paths = klawSync(SOURCE_DIR, {
  nodir: true
});

/**
 * 
 * @param {S3.PutObjectRequest} params 
 * @returns 
 */
function upload(params) {
  return new Promise(resolve => {
    s3.upload(params, (err, data) => {
      if (err) core.error(err);
      core.info(`uploaded - ${data.Key}`);
      core.info(`located - ${data.Location}`);
      resolve(data.Location);
    });
  });
}

function run() {
  const sourceDir = path.join(process.cwd(), SOURCE_DIR);
  return Promise.all(
    paths.map(p => {
      const fileStream = fs.createReadStream(p.path);
      const bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));

      // Map extension to compression type
      // We make the assumption that any files with these extensions are compressed
      const extensionEncodingMap = {
        br: 'br',
        gz: 'gzip'
      };
      
      const compressionExtRegex = new RegExp(`\.(${Object.keys(extensionEncodingMap).join('|')})$`, 'g');

      // Strip encoding extension from filename so we can find the correct mimetype later
      const filename = path.basename(p.path).replace(compressionExtRegex, '');
      const extension = path.extname(p.path);

      // Get the correct encoding matching the extension from map
      const contentEncoding = extensionEncodingMap[extension] || undefined;

      /** @type {S3.PutObjectRequest} */
      const params = {
        Bucket: BUCKET,
        ACL: 'public-read',
        Body: fileStream,
        Key: bucketPath,
        ContentType: lookup(filename) || 'text/plain',
      };

      if(contentEncoding) {
        params.ContentEncoding = contentEncoding;
      }
      
      return upload(params);
    })
  );
}

run()
  .then(locations => {
    core.info(`object key - ${destinationDir}`);
    core.info(`object locations - ${locations}`);
    core.setOutput('object_key', destinationDir);
    core.setOutput('object_locations', locations);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });
