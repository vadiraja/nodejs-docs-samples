// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const assert = require('assert');
const {execSync} = require('child_process');
const got = require('got');
const {GoogleAuth} = require('google-auth-library');
const auth = new GoogleAuth();

let BASE_URL, ID_TOKEN;
describe('End-to-End Tests', () => {
  // Retrieve Cloud Run service test config
  const {GOOGLE_CLOUD_PROJECT} = process.env;
  if (!GOOGLE_CLOUD_PROJECT) {
    throw Error('"GOOGLE_CLOUD_PROJECT" env var not found.');
  }
  let {SERVICE_NAME} = process.env;
  if (!SERVICE_NAME) {
    SERVICE_NAME = 'image-processing';
    console.log(
      `"SERVICE_NAME" env var not found. Defaulting to "${SERVICE_NAME}"`
    );
  }
  const {SAMPLE_VERSION} = process.env;
  const PLATFORM = 'managed';
  const REGION = 'us-central1';

  before(async () => {
    // Deploy service using Cloud Build
    let buildCmd =
      `gcloud builds submit --project ${GOOGLE_CLOUD_PROJECT} ` +
      '--config ./test/e2e_test_setup.yaml ' +
      `--substitutions _SERVICE=${SERVICE_NAME},_PLATFORM=${PLATFORM},_REGION=${REGION}`;
    if (SAMPLE_VERSION) buildCmd += `,_VERSION=${SAMPLE_VERSION}`;

    console.log('Starting Cloud Build...');
    execSync(buildCmd);
    console.log('Cloud Build completed.');

    // Retrieve URL of Cloud Run service
    const url = execSync(
      `gcloud run services describe ${SERVICE_NAME} --project=${GOOGLE_CLOUD_PROJECT} ` +
        `--platform=${PLATFORM} --region=${REGION} --format='value(status.url)'`
    );

    BASE_URL = url.toString('utf-8').trim();
    if (!BASE_URL) throw Error('Cloud Run service URL not found');

    // Retrieve ID token for testing
    const client = await auth.getIdTokenClient(BASE_URL);
    const clientHeaders = await client.getRequestHeaders();
    ID_TOKEN = clientHeaders['Authorization'].trim();
    if (!ID_TOKEN) throw Error('Unable to acquire an ID token.');
  });

  after(() => {
    let cleanUpCmd =
      `gcloud builds submit --project ${GOOGLE_CLOUD_PROJECT} ` +
      '--config ./test/e2e_test_cleanup.yaml ' +
      `--substitutions _SERVICE=${SERVICE_NAME},_PLATFORM=${PLATFORM},_REGION=${REGION}`;
    if (SAMPLE_VERSION) cleanUpCmd += `,_VERSION=${SAMPLE_VERSION}`;

    execSync(cleanUpCmd);
  });

  it('post(/) without body is a bad request', async () => {
    const options = {
      prefixUrl: BASE_URL,
      headers: {
        Authorization: ID_TOKEN,
      },
      method: 'POST',
      throwHttpErrors: false,
      retry: 3,
    };
    const response = await got('', options);
    assert.strictEqual(response.statusCode, 400);
  });

  it('post(/) without body message is a bad request', async () => {
    const options = {
      prefixUrl: BASE_URL,
      headers: {
        Authorization: ID_TOKEN,
      },
      method: 'POST',
      body: 'test',
      throwHttpErrors: false,
      retry: 3,
    };
    const response = await got('', options);
    assert.strictEqual(response.statusCode, 400);
  });

  it('successfully processes an image', async () => {
    const {Storage} = require('@google-cloud/storage');
    const storage = new Storage();
    let file_num = 0;
    for (let i = 0; i < 10; i++) {
      const [files] = await storage.bucket(`${SERVICE_NAME}_output`).getFiles();
      file_num = files.length;
      if (file_num > 0) {
        break;
      }
    }
    assert(file_num > 0);
  });
});
