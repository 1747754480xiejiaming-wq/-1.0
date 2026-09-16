import {parentPort, workerData} from 'node:worker_threads';
import type {FaqInput} from '@campus/contracts';
import {Store} from '../../apps/api/src/db/store.js';

interface ResolverWorkerData {
  dbPath: string;
  root: string;
  action: 'create' | 'link';
  actorId: string;
  faqId?: string;
}

const data = workerData as ResolverWorkerData;
const store = new Store(data.dbPath, data.root);
parentPort!.postMessage({type: 'ready'});

parentPort!.once('message', () => {
  try {
    store.enterWorkspace('workspace-a');
    const input: FaqInput = {
      question: '并发创建的问题',
      answer: '并发创建的答案',
      keywords: ['并发'],
      category: '测试分类',
      status: 'active',
      confirmed: true,
      libraryType: 'answer',
    };
    const result = store.resolveUnmatched(
      'unmatched-a',
      data.action,
      data.actorId,
      data.action === 'create' ? input : undefined,
      data.faqId,
    );
    parentPort!.postMessage({
      type: 'result',
      result: {action: data.action, actorId: data.actorId, ok: true, faqId: result.faq?.id},
    });
  } catch (error) {
    const failure = error as Error & {statusCode?: number; code?: string};
    parentPort!.postMessage({
      type: 'result',
      result: {
        action: data.action,
        actorId: data.actorId,
        ok: false,
        statusCode: failure.statusCode,
        code: failure.code,
        errorName: failure.name,
      },
    });
  } finally {
    store.close();
    parentPort!.close();
  }
});
