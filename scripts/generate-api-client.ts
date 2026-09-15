import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {normalizeLineEndings, openApiSourceHash} from './openapi-source-hash.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const SNAPSHOT_PATH = 'docs/api/openapi-v1.0.3.json';
const OUTPUT_PATH = 'apps/web/src/api/generated.ts';

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

type OpenApiParameter = {
  in?: 'path' | 'query' | 'header';
  name?: string;
  required?: boolean;
  schema?: JsonSchema;
};

type OpenApiOperation = {
  parameters?: OpenApiParameter[];
  requestBody?: {content?: Record<string, {schema?: JsonSchema}>};
  responses?: Record<string, {content?: Record<string, {schema?: JsonSchema}>}>;
};

type OpenApiDocument = {
  paths?: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], OpenApiOperation>>>;
};

type GeneratedOperation = {
  key: string;
  method: string;
  clientPath: string;
  requestType: string;
  responseType: string;
};

function schemaType(schema?: JsonSchema): string {
  if (!schema) return 'unknown';
  if (schema.anyOf?.length) return schema.anyOf.map(schemaType).join(' | ');
  if (schema.enum?.length) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.type === 'array') return `Array<${schemaType(schema.items)}>`;
  if (schema.type === 'object' || schema.properties) return objectType(schema.properties ?? {}, schema.required ?? []);
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'null') return 'null';
  if (schema.type === 'string') return 'string';
  return 'unknown';
}

function objectType(properties: Record<string, JsonSchema>, requiredNames: string[]): string {
  const required = new Set(requiredNames);
  const fields = Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, schema]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${schemaType(schema)}`);
  return fields.length ? `{ ${fields.join('; ')} }` : 'Record<string, unknown>';
}

function parametersType(parameters: OpenApiParameter[], location: 'path' | 'query'): string | undefined {
  const selected = parameters.filter((parameter) => parameter.in === location && parameter.name);
  if (!selected.length) return undefined;

  return objectType(
    Object.fromEntries(selected.map((parameter) => [parameter.name!, parameter.schema ?? {}])),
    selected.filter((parameter) => parameter.required).map((parameter) => parameter.name!),
  );
}

function jsonSchema(content?: Record<string, {schema?: JsonSchema}>): JsonSchema | undefined {
  return content?.['application/json']?.schema;
}

function requestType(operation: OpenApiOperation): string {
  const parts: string[] = [];
  const pathParameters = parametersType(operation.parameters ?? [], 'path');
  const queryParameters = parametersType(operation.parameters ?? [], 'query');
  const body = jsonSchema(operation.requestBody?.content);

  if (pathParameters) parts.push(`params: ${pathParameters}`);
  if (queryParameters) parts.push(`query: ${queryParameters}`);
  if (body) parts.push(`body: ${schemaType(body)}`);
  if (parts.length === 1 && body && !pathParameters && !queryParameters) return schemaType(body);
  return parts.length ? `{ ${parts.join('; ')} }` : 'undefined';
}

function responseType(operation: OpenApiOperation): string {
  const successResponse = Object.entries(operation.responses ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .find(([status]) => /^2\d\d$/.test(status))?.[1];
  return schemaType(jsonSchema(successResponse?.content));
}

function collectOperations(document: OpenApiDocument): GeneratedOperation[] {
  const operations: GeneratedOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        clientPath: path.startsWith('/api/v1') ? path.slice('/api/v1'.length) || '/' : path,
        requestType: requestType(operation),
        responseType: responseType(operation),
      });
    }
  }
  return operations;
}

function generatedSource(sourceHash: string, operations: GeneratedOperation[]): string {
  const operationValues = operations
    .map(({key, method, clientPath}) => `  ${JSON.stringify(key)}: {method: ${JSON.stringify(method)}, path: ${JSON.stringify(clientPath)}},`)
    .join('\n');
  const operationTypes = operations
    .map(({key, requestType: request, responseType: response}) =>
      `  ${JSON.stringify(key)}: {request: ${request}; response: ${response}};`,
    )
    .join('\n');

  return `/* 此文件由 scripts/generate-api-client.ts 自动生成，请勿手工修改。 */
export const OPENAPI_SOURCE_PATH = ${JSON.stringify(SNAPSHOT_PATH)} as const;
export const OPENAPI_SOURCE_SHA256 = ${JSON.stringify(sourceHash)} as const;

export const API_OPERATIONS = {
${operationValues}
} as const;

export type ApiOperation = keyof typeof API_OPERATIONS;

export interface ApiOperationMap {
${operationTypes}
}

export type ApiRequest<Operation extends ApiOperation> = ApiOperationMap[Operation]['request'];
export type ApiResponse<Operation extends ApiOperation> = ApiOperationMap[Operation]['response'];
`;
}

function main(): void {
  const projectRoot = process.cwd();
  const snapshotPath = resolve(projectRoot, SNAPSHOT_PATH);
  const outputPath = resolve(projectRoot, OUTPUT_PATH);
  const snapshot = readFileSync(snapshotPath);
  const document = JSON.parse(snapshot.toString('utf8')) as OpenApiDocument;
  const source = generatedSource(openApiSourceHash(snapshot), collectOperations(document));

  if (process.argv.includes('--check')) {
    const currentSource = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
    if (normalizeLineEndings(currentSource) !== normalizeLineEndings(source)) {
      throw new Error(`前端 API 客户端已过期，请运行 npm run api:generate：${relative(projectRoot, outputPath)}`);
    }
    process.stdout.write(`前端 API 客户端与 OpenAPI 快照一致：${relative(projectRoot, outputPath)}\n`);
    return;
  }

  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, source, 'utf8');
  process.stdout.write(`前端 API 客户端已生成：${relative(projectRoot, outputPath)}\n`);
}

main();
