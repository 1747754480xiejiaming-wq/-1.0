import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadQuestionImages,IMAGE_DOWNLOAD_ERROR} from '../apps/qq-bot/src/images.js';
import {requestAnswer} from '../apps/qq-bot/src/transport.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
test('QQ 私有图片在机器人端鉴权下载，后端只接收图片数据',async()=>{
  let tokens=0,downloads=0;const getToken=async()=>{tokens++;return 'qq-private-test-token';};
  const images=await downloadQuestionImages([{content_type:'Image/PNG; charset=binary',url:'http://multimedia.nt.qq.com.cn/download?a=1'},{content_type:'image/png',url:'https://gchat.qpic.cn/a'}],getToken,async(url,init)=>{
    downloads++;assert.equal(new URL(String(url)).protocol,'https:');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),new URL(String(url)).hostname==='multimedia.nt.qq.com.cn'?'QQBot qq-private-test-token':null);return new Response(png);
  });assert.equal(tokens,1);assert.equal(images.length,2);assert.ok(images.every(item=>item.startsWith('data:image/png;base64,')));
  const answer=await requestAnswer('http://127.0.0.1:3001','local-service-token','','image-request',async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.question,'');assert.deepEqual(body.images,images);assert.ok(!String(init?.body).includes('qq-private-test-token'));return Response.json({requestId:'image-request',answer:'缓考标准答案',source:'faq_keyword',isDemo:false});},images);assert.equal(answer,'缓考标准答案');
});
test('QQ 图片拒绝外部地址、过大图片、伪造内容和下载失败',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response(png);};
  for(const url of ['http://127.0.0.1/a','https://multimedia.nt.qq.com.cn.attacker.invalid/a','https://a:q@multimedia.nt.qq.com.cn/a'])await assert.rejects(downloadQuestionImages([{content_type:'image/png',url}],async()=>{throw Error('must not read token');},fetcher),{message:IMAGE_DOWNLOAD_ERROR});assert.equal(calls,0);
  const attachment={content_type:'image/png',url:'https://gchat.qpic.cn/a'};
  await assert.rejects(downloadQuestionImages([{...attachment,size:2*1024*1024+1}],async()=>'',fetcher));assert.equal(calls,0);
  for(const result of [new Response('not an image'),new Response('',{status:403}),new Response(new Uint8Array(2*1024*1024+1))])await assert.rejects(downloadQuestionImages([attachment],async()=>'',async()=>result),{message:IMAGE_DOWNLOAD_ERROR});
  await assert.rejects(downloadQuestionImages(Array(4).fill(attachment),async()=>'',fetcher),/最多发送 3 张/);
});
