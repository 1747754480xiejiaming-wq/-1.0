import assert from 'node:assert/strict';
import test from 'node:test';
import {openApiSourceHash} from '../scripts/openapi-source-hash.js';

test('OpenAPI 哈希不受 Git 换行符转换影响', () => {
  const lineFeed = '{\n  "openapi": "3.0.3"\n}\n';
  const carriageReturnLineFeed = lineFeed.replace(/\n/g, '\r\n');

  assert.equal(openApiSourceHash(lineFeed), openApiSourceHash(carriageReturnLineFeed));
});
