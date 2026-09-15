import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ReplyTarget} from '@tencent-connect/qqbot-nodejs';
import {formatNicknameReply,sendQuestionReply,shouldSendQuestionReply} from '../apps/qq-bot/src/transport.js';

test('群聊只回复真实命中的答案，私聊始终回复',()=>{
  for(const source of ['faq_keyword','faq_semantic','forbidden_keyword','forbidden_semantic','rag'] as const)assert.equal(shouldSendQuestionReply('group',source),true);
  assert.equal(shouldSendQuestionReply('group','fallback'),false);
  assert.equal(shouldSendQuestionReply('group','fallback',false,'manual_transfer'),true);
  assert.equal(shouldSendQuestionReply('group'),false);
  assert.equal(shouldSendQuestionReply('group',undefined,true),true);
  assert.equal(shouldSendQuestionReply('c2c','fallback'),true);
  assert.equal(shouldSendQuestionReply('c2c'),true);
});

test('群聊答案显示清洗后的昵称，私聊保持原文',()=>{
  assert.equal(formatNicknameReply(' Irene\n','答案'),'@Irene 答案');
  assert.equal(formatNicknameReply(undefined,'答案'),'答案');
  assert.equal(formatNicknameReply('张\u200b三\r\n同学','答案'),'@张三同学 答案');
  assert.equal(formatNicknameReply('Irene','@Irene 延缓毕业'),'@Irene 延缓毕业');
  assert.equal(formatNicknameReply('Irene','@Irene @Irene 延缓毕业'),'@Irene 延缓毕业');
});

test('电脑 QQ 兼容：群聊被动回复依靠平台 @，不再手工重复昵称',async()=>{
  const target={scope:'group',targetId:'group_openid',msgId:'message_id'} as ReplyTarget;
  const calls:{target:ReplyTarget;content:string}[]=[];
  const client={
    async sendText(sentTarget:ReplyTarget,content:string){calls.push({target:sentTarget,content});return {id:'sent'};},
  };
  await sendQuestionReply(client,target,'group','Irene','请注意言辞');
  assert.deepEqual(calls,[{target,content:'请注意言辞'}]);
  assert.equal(calls[0].content.includes('openid'),false);
  assert.equal(calls[0].content.includes('qqbot-at-user'),false);
});

test('群聊延迟主动回发没有 msgId 时只补一个昵称',async()=>{
  const target={scope:'group',targetId:'group_openid'} as ReplyTarget,calls:string[]=[];
  const client={async sendText(_target:ReplyTarget,content:string){calls.push(content);return {id:'sent'};}};
  await sendQuestionReply(client,target,'group','Irene','@Irene @Irene 请到教务办公室办理');
  assert.deepEqual(calls,['@Irene 请到教务办公室办理']);
});

test('私聊回答保持普通文本且不添加昵称前缀',async()=>{
  const target={scope:'group',targetId:'group_openid',msgId:'message_id'} as ReplyTarget;
  const calls:string[]=[];
  const client={
    async sendText(_target:ReplyTarget,content:string){calls.push(`text:${content}`);return {id:'text-sent'};},
  };
  await sendQuestionReply(client,{...target,scope:'c2c'},'c2c','Irene','私聊答案');
  assert.deepEqual(calls,['text:私聊答案']);
});
