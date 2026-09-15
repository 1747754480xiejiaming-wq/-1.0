/* 此文件由 scripts/generate-api-client.ts 自动生成，请勿手工修改。 */
export const OPENAPI_SOURCE_PATH = "docs/api/openapi-v1.0.3.json" as const;
export const OPENAPI_SOURCE_SHA256 = "d9916a8e2af3b7af7056c3d5426a64e1d11cb5856650e0aa7f4d7ec6285df840" as const;

export const API_OPERATIONS = {
  "GET /api/v1/admin/account": {method: "GET", path: "/admin/account"},
  "POST /api/v1/admin/account/upgrade": {method: "POST", path: "/admin/account/upgrade"},
  "POST /api/v1/admin/answer/test": {method: "POST", path: "/admin/answer/test"},
  "GET /api/v1/admin/bot/config": {method: "GET", path: "/admin/bot/config"},
  "POST /api/v1/admin/bot/config": {method: "POST", path: "/admin/bot/config"},
  "POST /api/v1/admin/bot/start": {method: "POST", path: "/admin/bot/start"},
  "POST /api/v1/admin/bot/stop": {method: "POST", path: "/admin/bot/stop"},
  "GET /api/v1/admin/developer/access": {method: "GET", path: "/admin/developer/access"},
  "POST /api/v1/admin/developer/unlock": {method: "POST", path: "/admin/developer/unlock"},
  "GET /api/v1/admin/materials": {method: "GET", path: "/admin/materials"},
  "DELETE /api/v1/admin/materials": {method: "DELETE", path: "/admin/materials"},
  "PATCH /api/v1/admin/materials/{id}": {method: "PATCH", path: "/admin/materials/{id}"},
  "DELETE /api/v1/admin/materials/{id}": {method: "DELETE", path: "/admin/materials/{id}"},
  "GET /api/v1/admin/materials/{id}/download": {method: "GET", path: "/admin/materials/{id}/download"},
  "GET /api/v1/admin/materials/categories": {method: "GET", path: "/admin/materials/categories"},
  "POST /api/v1/admin/materials/categories": {method: "POST", path: "/admin/materials/categories"},
  "PATCH /api/v1/admin/materials/categories/{id}": {method: "PATCH", path: "/admin/materials/categories/{id}"},
  "DELETE /api/v1/admin/materials/categories/{id}": {method: "DELETE", path: "/admin/materials/categories/{id}"},
  "GET /api/v1/admin/materials/download.zip": {method: "GET", path: "/admin/materials/download.zip"},
  "GET /api/v1/admin/models": {method: "GET", path: "/admin/models"},
  "POST /api/v1/admin/models/{provider}/connect": {method: "POST", path: "/admin/models/{provider}/connect"},
  "POST /api/v1/admin/models/{provider}/disconnect": {method: "POST", path: "/admin/models/{provider}/disconnect"},
  "POST /api/v1/admin/models/select": {method: "POST", path: "/admin/models/select"},
  "GET /api/v1/admin/notifications": {method: "GET", path: "/admin/notifications"},
  "POST /api/v1/admin/notifications": {method: "POST", path: "/admin/notifications"},
  "DELETE /api/v1/admin/notifications/{id}": {method: "DELETE", path: "/admin/notifications/{id}"},
  "GET /api/v1/admin/qq/groups": {method: "GET", path: "/admin/qq/groups"},
  "PATCH /api/v1/admin/qq/groups/{id}": {method: "PATCH", path: "/admin/qq/groups/{id}"},
  "DELETE /api/v1/admin/qq/groups/{id}": {method: "DELETE", path: "/admin/qq/groups/{id}"},
  "GET /api/v1/admin/status": {method: "GET", path: "/admin/status"},
  "POST /api/v1/auth/login": {method: "POST", path: "/auth/login"},
  "POST /api/v1/auth/logout": {method: "POST", path: "/auth/logout"},
  "POST /api/v1/auth/register": {method: "POST", path: "/auth/register"},
  "GET /api/v1/auth/session": {method: "GET", path: "/auth/session"},
  "GET /api/v1/developer/accounts": {method: "GET", path: "/developer/accounts"},
  "POST /api/v1/developer/accounts/{id}/reset-password": {method: "POST", path: "/developer/accounts/{id}/reset-password"},
  "GET /api/v1/faqs": {method: "GET", path: "/faqs"},
  "POST /api/v1/faqs": {method: "POST", path: "/faqs"},
  "PATCH /api/v1/faqs/{id}": {method: "PATCH", path: "/faqs/{id}"},
  "DELETE /api/v1/faqs/{id}": {method: "DELETE", path: "/faqs/{id}"},
  "POST /api/v1/faqs/{id}/attachments": {method: "POST", path: "/faqs/{id}/attachments"},
  "DELETE /api/v1/faqs/{id}/attachments/{attachmentId}": {method: "DELETE", path: "/faqs/{id}/attachments/{attachmentId}"},
  "GET /api/v1/faqs/{id}/attachments/{attachmentId}/download": {method: "GET", path: "/faqs/{id}/attachments/{attachmentId}/download"},
  "POST /api/v1/faqs/abuse-lexicon/import": {method: "POST", path: "/faqs/abuse-lexicon/import"},
  "POST /api/v1/faqs/batch": {method: "POST", path: "/faqs/batch"},
  "GET /api/v1/faqs/export": {method: "GET", path: "/faqs/export"},
  "GET /api/v1/faqs/export-package.zip": {method: "GET", path: "/faqs/export-package.zip"},
  "GET /api/v1/faqs/export.xlsx": {method: "GET", path: "/faqs/export.xlsx"},
  "POST /api/v1/faqs/import": {method: "POST", path: "/faqs/import"},
  "POST /api/v1/faqs/import.xlsx": {method: "POST", path: "/faqs/import.xlsx"},
  "POST /api/v1/faqs/optimize-answer": {method: "POST", path: "/faqs/optimize-answer"},
  "GET /api/v1/health/live": {method: "GET", path: "/health/live"},
  "GET /api/v1/health/ready": {method: "GET", path: "/health/ready"},
  "POST /api/v1/internal/qq/answer": {method: "POST", path: "/internal/qq/answer"},
  "GET /api/v1/knowledge/categories": {method: "GET", path: "/knowledge/categories"},
  "POST /api/v1/knowledge/categories": {method: "POST", path: "/knowledge/categories"},
  "PATCH /api/v1/knowledge/categories/{id}": {method: "PATCH", path: "/knowledge/categories/{id}"},
  "DELETE /api/v1/knowledge/categories/{id}": {method: "DELETE", path: "/knowledge/categories/{id}"},
  "POST /api/v1/rag/documents": {method: "POST", path: "/rag/documents"},
  "DELETE /api/v1/rag/documents/{id}": {method: "DELETE", path: "/rag/documents/{id}"},
  "GET /api/v1/rag/documents/{id}/chunks": {method: "GET", path: "/rag/documents/{id}/chunks"},
  "GET /api/v1/rag/documents/{id}/graph": {method: "GET", path: "/rag/documents/{id}/graph"},
  "POST /api/v1/rag/documents/{id}/reparse": {method: "POST", path: "/rag/documents/{id}/reparse"},
  "POST /api/v1/rag/evaluate": {method: "POST", path: "/rag/evaluate"},
  "GET /api/v1/rag/export-package.zip": {method: "GET", path: "/rag/export-package.zip"},
  "GET /api/v1/rag/export.xlsx": {method: "GET", path: "/rag/export.xlsx"},
  "POST /api/v1/rag/folders": {method: "POST", path: "/rag/folders"},
  "PATCH /api/v1/rag/folders/{id}": {method: "PATCH", path: "/rag/folders/{id}"},
  "DELETE /api/v1/rag/folders/{id}": {method: "DELETE", path: "/rag/folders/{id}"},
  "GET /api/v1/rag/models": {method: "GET", path: "/rag/models"},
  "POST /api/v1/rag/search": {method: "POST", path: "/rag/search"},
  "GET /api/v1/rag/settings": {method: "GET", path: "/rag/settings"},
  "PATCH /api/v1/rag/settings": {method: "PATCH", path: "/rag/settings"},
  "GET /api/v1/rag/tree": {method: "GET", path: "/rag/tree"},
  "GET /api/v1/status": {method: "GET", path: "/status"},
  "GET /api/v1/unmatched": {method: "GET", path: "/unmatched"},
  "PATCH /api/v1/unmatched/{id}/qq-students/{senderId}": {method: "PATCH", path: "/unmatched/{id}/qq-students/{senderId}"},
  "POST /api/v1/unmatched/{id}/resolve": {method: "POST", path: "/unmatched/{id}/resolve"},
  "POST /api/v1/unmatched/batch": {method: "POST", path: "/unmatched/batch"},
  "GET /api/v1/unmatched/preferences": {method: "GET", path: "/unmatched/preferences"},
  "PATCH /api/v1/unmatched/preferences": {method: "PATCH", path: "/unmatched/preferences"},
} as const;

export type ApiOperation = keyof typeof API_OPERATIONS;

export interface ApiOperationMap {
  "GET /api/v1/admin/account": {request: undefined; response: unknown};
  "POST /api/v1/admin/account/upgrade": {request: { "key": string }; response: unknown};
  "POST /api/v1/admin/answer/test": {request: { "images"?: Array<string>; "qqSender"?: { "chatKind"?: "c2c" | "group"; "id": string; "messageId"?: string; "name"?: string; "qqNumber"?: string; "targetId"?: string }; "question": string; "requestId": string }; response: { "answer": string; "attachments"?: Array<{ "createdAt": number; "faqId"?: string; "id": string; "kind": "folder" | "image" | "pdf" | "word" | "excel" | "video"; "mime": string; "name": string; "size": number }>; "fallbackReason": string | null; "faqId": string | null; "faqVersion": number | null; "isDemo": boolean; "requestId": string; "source": "faq_keyword" | "faq_semantic" | "forbidden_keyword" | "forbidden_semantic" | "rag" | "fallback" }};
  "GET /api/v1/admin/bot/config": {request: undefined; response: unknown};
  "POST /api/v1/admin/bot/config": {request: { "appId": string; "appSecret"?: string }; response: unknown};
  "POST /api/v1/admin/bot/start": {request: undefined; response: unknown};
  "POST /api/v1/admin/bot/stop": {request: undefined; response: unknown};
  "GET /api/v1/admin/developer/access": {request: undefined; response: unknown};
  "POST /api/v1/admin/developer/unlock": {request: { "key": string }; response: unknown};
  "GET /api/v1/admin/materials": {request: { query: { "categoryId"?: string; "page"?: number; "pageSize"?: number; "q"?: string; "status"?: "pending_confirm" | "pending_archive" | "archived" } }; response: unknown};
  "DELETE /api/v1/admin/materials": {request: { "ids": Array<string> }; response: unknown};
  "PATCH /api/v1/admin/materials/{id}": {request: { params: { "id": string }; body: { "categoryId": string | null } }; response: unknown};
  "DELETE /api/v1/admin/materials/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/admin/materials/{id}/download": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/admin/materials/categories": {request: undefined; response: unknown};
  "POST /api/v1/admin/materials/categories": {request: { "name": string }; response: unknown};
  "PATCH /api/v1/admin/materials/categories/{id}": {request: { params: { "id": string }; body: { "name": string } }; response: unknown};
  "DELETE /api/v1/admin/materials/categories/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/admin/materials/download.zip": {request: { query: { "ids": string } }; response: unknown};
  "GET /api/v1/admin/models": {request: undefined; response: unknown};
  "POST /api/v1/admin/models/{provider}/connect": {request: { params: { "provider": "deepseek" | "zhipu" }; body: { "apiKey"?: string } }; response: unknown};
  "POST /api/v1/admin/models/{provider}/disconnect": {request: { params: { "provider": "deepseek" | "zhipu" } }; response: unknown};
  "POST /api/v1/admin/models/select": {request: { "provider": "deepseek" | "zhipu" }; response: unknown};
  "GET /api/v1/admin/notifications": {request: { query: { "limit"?: number } }; response: unknown};
  "POST /api/v1/admin/notifications": {request: undefined; response: unknown};
  "DELETE /api/v1/admin/notifications/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/admin/qq/groups": {request: undefined; response: unknown};
  "PATCH /api/v1/admin/qq/groups/{id}": {request: { params: { "id": string }; body: { "enabled": boolean; "groupNumber"?: string; "label": string } }; response: unknown};
  "DELETE /api/v1/admin/qq/groups/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/admin/status": {request: undefined; response: unknown};
  "POST /api/v1/auth/login": {request: { "password": string; "username": string }; response: unknown};
  "POST /api/v1/auth/logout": {request: undefined; response: unknown};
  "POST /api/v1/auth/register": {request: { "password": string; "registrationCode": string; "username": string }; response: unknown};
  "GET /api/v1/auth/session": {request: undefined; response: unknown};
  "GET /api/v1/developer/accounts": {request: undefined; response: unknown};
  "POST /api/v1/developer/accounts/{id}/reset-password": {request: { params: { "id": string }; body: { "password": string } }; response: unknown};
  "GET /api/v1/faqs": {request: { query: { "category"?: string; "libraryType"?: "answer" | "forbidden"; "page"?: number; "pageSize"?: number; "q"?: string; "status"?: string; "unmatchedType"?: "manual" | "unrelated" | "offline" } }; response: unknown};
  "POST /api/v1/faqs": {request: { "answer": string; "category": string; "confirmed": boolean; "keywords": Array<string>; "libraryType"?: "answer" | "forbidden"; "question": string; "status": "active" | "disabled" }; response: unknown};
  "PATCH /api/v1/faqs/{id}": {request: { params: { "id": string }; body: { "answer": string; "category": string; "confirmed": boolean; "keywords": Array<string>; "libraryType"?: "answer" | "forbidden"; "question": string; "status": "active" | "disabled"; "version": number } }; response: unknown};
  "DELETE /api/v1/faqs/{id}": {request: { params: { "id": string }; body: { "version": number } }; response: unknown};
  "POST /api/v1/faqs/{id}/attachments": {request: { params: { "id": string }; query: { "folderName"?: string; "kind"?: "folder" } }; response: unknown};
  "DELETE /api/v1/faqs/{id}/attachments/{attachmentId}": {request: { params: { "attachmentId": string; "id": string } }; response: unknown};
  "GET /api/v1/faqs/{id}/attachments/{attachmentId}/download": {request: { params: { "attachmentId": string; "id": string } }; response: unknown};
  "POST /api/v1/faqs/abuse-lexicon/import": {request: undefined; response: unknown};
  "POST /api/v1/faqs/batch": {request: { "action": "update" | "delete"; "category"?: string; "ids": Array<string>; "libraryType": "answer" | "forbidden"; "status"?: "active" | "disabled" }; response: unknown};
  "GET /api/v1/faqs/export": {request: { query: { "libraryType"?: "answer" | "forbidden" } }; response: unknown};
  "GET /api/v1/faqs/export-package.zip": {request: { query: { "libraryType"?: "answer" | "forbidden" } }; response: unknown};
  "GET /api/v1/faqs/export.xlsx": {request: { query: { "libraryType"?: "answer" | "forbidden" } }; response: unknown};
  "POST /api/v1/faqs/import": {request: { "items": Array<{ "answer": string; "category": string; "confirmed": boolean; "id"?: string; "keywords": Array<string>; "libraryType"?: "answer" | "forbidden"; "question": string; "status": "active" | "disabled" }> }; response: unknown};
  "POST /api/v1/faqs/import.xlsx": {request: { query: { "libraryType"?: "answer" | "forbidden" } }; response: unknown};
  "POST /api/v1/faqs/optimize-answer": {request: { "answer": string; "question": string }; response: unknown};
  "GET /api/v1/health/live": {request: undefined; response: unknown};
  "GET /api/v1/health/ready": {request: undefined; response: unknown};
  "POST /api/v1/internal/qq/answer": {request: { "images"?: Array<string>; "qqSender"?: { "chatKind"?: "c2c" | "group"; "id": string; "messageId"?: string; "name"?: string; "qqNumber"?: string; "targetId"?: string }; "question": string; "requestId": string }; response: { "answer": string; "attachments"?: Array<{ "createdAt": number; "faqId"?: string; "id": string; "kind": "folder" | "image" | "pdf" | "word" | "excel" | "video"; "mime": string; "name": string; "size": number }>; "fallbackReason": string | null; "faqId": string | null; "faqVersion": number | null; "isDemo": boolean; "requestId": string; "source": "faq_keyword" | "faq_semantic" | "forbidden_keyword" | "forbidden_semantic" | "rag" | "fallback" }};
  "GET /api/v1/knowledge/categories": {request: { query: { "libraryType": "answer" | "forbidden" } }; response: unknown};
  "POST /api/v1/knowledge/categories": {request: { "libraryType": "answer" | "forbidden"; "name": string }; response: unknown};
  "PATCH /api/v1/knowledge/categories/{id}": {request: { params: { "id": string }; body: { "name": string } }; response: unknown};
  "DELETE /api/v1/knowledge/categories/{id}": {request: { params: { "id": string } }; response: unknown};
  "POST /api/v1/rag/documents": {request: { query: { "folderId"?: string } }; response: unknown};
  "DELETE /api/v1/rag/documents/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/rag/documents/{id}/chunks": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/rag/documents/{id}/graph": {request: { params: { "id": string } }; response: unknown};
  "POST /api/v1/rag/documents/{id}/reparse": {request: { params: { "id": string } }; response: unknown};
  "POST /api/v1/rag/evaluate": {request: { "cases": Array<{ "expectedAnswer": string; "question": string }> }; response: unknown};
  "GET /api/v1/rag/export-package.zip": {request: undefined; response: unknown};
  "GET /api/v1/rag/export.xlsx": {request: undefined; response: unknown};
  "POST /api/v1/rag/folders": {request: { "name": string; "parentId"?: string | null }; response: unknown};
  "PATCH /api/v1/rag/folders/{id}": {request: { params: { "id": string }; body: { "name": string } }; response: unknown};
  "DELETE /api/v1/rag/folders/{id}": {request: { params: { "id": string } }; response: unknown};
  "GET /api/v1/rag/models": {request: { query: { "type": "embedding" | "rerank" } }; response: unknown};
  "POST /api/v1/rag/search": {request: { "question": string; "topK"?: number }; response: unknown};
  "GET /api/v1/rag/settings": {request: undefined; response: unknown};
  "PATCH /api/v1/rag/settings": {request: { "chunkOverlap": number; "chunkSize": number; "embeddingModel": string; "parserMode": "local" | "model"; "rerankModel": string; "topK": number }; response: unknown};
  "GET /api/v1/rag/tree": {request: undefined; response: unknown};
  "GET /api/v1/status": {request: undefined; response: unknown};
  "GET /api/v1/unmatched": {request: { query: { "category"?: string; "libraryType"?: "answer" | "forbidden"; "page"?: number; "pageSize"?: number; "q"?: string; "status"?: string; "unmatchedType"?: "manual" | "unrelated" | "offline" } }; response: unknown};
  "PATCH /api/v1/unmatched/{id}/qq-students/{senderId}": {request: { params: { "id": string; "senderId": string }; body: { "name": string; "qqNumber": string } }; response: unknown};
  "POST /api/v1/unmatched/{id}/resolve": {request: { params: { "id": string }; body: { "action": "create" | "link" | "ignore"; "faq"?: { "answer": string; "category": string; "confirmed": boolean; "keywords": Array<string>; "libraryType"?: "answer" | "forbidden"; "question": string; "status": "active" | "disabled" }; "faqId"?: string } }; response: unknown};
  "POST /api/v1/unmatched/batch": {request: { "action": "ignore" | "delete"; "ids": Array<string> }; response: unknown};
  "GET /api/v1/unmatched/preferences": {request: undefined; response: unknown};
  "PATCH /api/v1/unmatched/preferences": {request: { "offlineAutoReply": boolean }; response: unknown};
}

export type ApiRequest<Operation extends ApiOperation> = ApiOperationMap[Operation]['request'];
export type ApiResponse<Operation extends ApiOperation> = ApiOperationMap[Operation]['response'];
