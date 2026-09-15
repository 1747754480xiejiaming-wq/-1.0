import http from 'k6/http';
import { check,sleep } from 'k6';
import { Rate,Trend } from 'k6/metrics';

const session=JSON.parse(open('../qa/load-session.json')),errors=new Rate('queue_errors'),enqueueLatency=new Trend('enqueue_latency',true);
export const options={summaryTrendStats:['avg','min','med','max','p(95)','p(99)'],stages:[{duration:'5s',target:10},{duration:'30s',target:10},{duration:'5s',target:0}],thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<750','p(99)<1500'],queue_errors:['rate<0.01'],enqueue_latency:['p(95)<750'],checks:['rate>0.99']}};
export default function(){
  const forwarded=`10.${__VU}.${Math.floor(__ITER/250)}.${(__ITER%250)+1}`,headers={'Content-Type':'application/json',Cookie:session.cookie,'X-CSRF-Token':session.csrf,'X-Forwarded-For':forwarded};
  const response=http.post(`${session.baseUrl}/api/v1/admin/notifications`,JSON.stringify({requestId:`notice-${__VU}-${__ITER}-${Date.now()}`,title:'负载测试通知',content:'这是一条只发送到隔离测试队列的稳定性验证消息。',groupIds:session.groupIds.slice(0,3)}),{headers,tags:{operation:'enqueue-notification'}}),ok=check(response,{'notification accepted':value=>value.status===202,'three targets queued':value=>value.json('targetCount')===3});enqueueLatency.add(response.timings.duration);errors.add(!ok);
  const botHeaders={'Content-Type':'application/json',Authorization:`Bearer ${session.botToken}`,'X-Forwarded-For':forwarded},claimed=http.post(`${session.baseUrl}/api/v1/internal/qq/notifications/claim`,JSON.stringify({limit:5}),{headers:botHeaders,tags:{operation:'claim-notification'}});if(check(claimed,{'queue claim 200':value=>value.status===200})){for(const item of claimed.json('items')||[]){const begin=http.post(`${session.baseUrl}/api/v1/internal/qq/notifications/${item.id}/begin`,JSON.stringify({claimToken:item.claimToken}),{headers:botHeaders,tags:{operation:'begin-notification'}});errors.add(!check(begin,{'begin allowed':value=>value.status===200&&value.json('canSend')===true}));const ack=http.post(`${session.baseUrl}/api/v1/internal/qq/notifications/${item.id}/result`,JSON.stringify({status:'sent',claimToken:item.claimToken}),{headers:{...botHeaders,'Content-Type':'application/json'},tags:{operation:'complete-notification'}});errors.add(!check(ack,{'queue completion 200':value=>value.status===200}));}}
  const history=http.get(`${session.baseUrl}/api/v1/admin/notifications?limit=20`,{headers,tags:{operation:'notification-history'}});errors.add(!check(history,{'history 200':value=>value.status===200}));
  sleep(.5);
}
