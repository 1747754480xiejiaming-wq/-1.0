import { AppError } from '../errors.js';
import { Models } from './models.js';

export class AnswerOptimizer {
  constructor(private models: Models) {}

  async optimize(question: string, answer: string) {
    const cleanQuestion = question.trim();
    const cleanAnswer = answer.trim();
    if (!cleanAnswer) throw new AppError(400, 'EMPTY_STANDARD_ANSWER', '请先输入标准答案。');
    const result = await this.models.completeJson<{ answer?: unknown }>(
      '你是校园教务标准答案编辑助手。仅优化原答案的表达逻辑、语序、层次和步骤排序。必须保留原有事实、条件、数字、时间、地点和限制，不得增加原文没有的政策或结论，不得删除关键办理条件。语言要准确、简洁、便于学生执行。只输出 JSON：{"answer":"优化后的完整标准答案"}。',
      { question: cleanQuestion.slice(0, 200), answer: cleanAnswer },
      1200,
    );
    if (typeof result.answer !== 'string') throw new AppError(502, 'MODEL_INVALID_ANSWER', '模型未返回有效的优化结果，请重试。');
    const optimized = result.answer.trim().replace(/[\p{Cc}\p{Cf}]/gu, ' ');
    if (!optimized || optimized.length > 1500) throw new AppError(502, 'MODEL_INVALID_ANSWER', '模型返回的优化结果无效或超过 1500 字，请重试。');
    return { answer: optimized };
  }
}
