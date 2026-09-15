import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOT_INTRODUCTION,identityReply,replyWithIdentity} from '../apps/qq-bot/src/identity.js';
test('机器人身份询问直接使用固定介绍，措辞与标点原样保留',()=>{
  assert.equal(BOT_INTRODUCTION,"大家好！我是净千回源科技开发的材环教秘智能助手，是一款面向材料与环境相关专业师生打造的智能教学管理助手。我可以协助处理教学通知、课程安排、考试事务等日常工作，为教师和学生提供快速、准确、便捷的信息服务。\n\n通过智能问答、事项提醒、流程指引和文档辅助等功能，教秘AI助手有效提升教学管理效率，减少重复性事务，让信息传递更及时、师生沟通更顺畅，助力材环学院教学工作更加规范、高效、智能。\n很高兴为大家服务！让我们进行愉快的交流之旅吧!");
  for(const question of ['你是谁','你是什么东西？','请问你到底是谁呀','你好，请介绍一下你自己。','请自我介绍','做个自我介绍吧','你是谁开发的','你叫什么名字','你是什么机器人','who are you?','请你自我介绍','你能自我介绍一下吗','你是什么？'])assert.equal(identityReply(question),BOT_INTRODUCTION,question);
  for(const question of ['如何申请缓考','请介绍一下毕业手续','谁负责材料提交','不要自我介绍，请问选课截止时间','你是谁的辅导员','你是谁？我该如何申请退课？'])assert.equal(identityReply(question),null,question);
});

test('固定介绍优先于图片、知识库和付费模型，不依赖它们的可用性',async()=>{
  let calls=0;
  const unavailable=async()=>{calls++;throw new Error('服务未启动或本周额度用尽');};
  assert.equal(await replyWithIdentity('你是什么东西？',unavailable),BOT_INTRODUCTION);
  assert.equal(calls,0);
  assert.equal(await replyWithIdentity('如何办理缓考',async()=>{calls++;return '标准教务答案';}),'标准教务答案');
  assert.equal(calls,1);
});
