export class AppError extends Error { constructor(public statusCode: number, public code: string, message: string) { super(message); } }
export const conflict = (message = '内容已更新，请刷新后重试。') => new AppError(409, 'CONFLICT', message);
