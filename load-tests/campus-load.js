import http from 'k6/http';
import { check,sleep } from 'k6';
import { Rate,Trend } from 'k6/metrics';

const session=JSON.parse(open('../qa/load-session.json')),scenario=__ENV.SCENARIO||'baseline';
const traffic={
  baseline:[{duration:'5s',target:10},{duration:'20s',target:10},{duration:'5s',target:0}],
  peak:[{duration:'8s',target:50},{duration:'30s',target:50},{duration:'7s',target:0}],
  spike:[{duration:'5s',target:10},{duration:'5s',target:100},{duration:'15s',target:100},{duration:'5s',target:0}],
  soak:[{duration:'8s',target:25},{duration:'300s',target:25},{duration:'7s',target:0}],
};
const errors=new Rate('business_errors'),answerLatency=new Trend('answer_latency',true);
const standardThresholds={http_req_failed:['rate<0.01'],http_req_duration:['p(95)<500','p(99)<1000'],business_errors:['rate<0.01'],answer_latency:['p(95)<600'],checks:['rate>0.99']};
export const options=scenario==='students2000'?{summaryTrendStats:['avg','min','med','max','p(95)','p(99)'],scenarios:{students2000:{executor:'ramping-vus',startVUs:0,stages:[{duration:'5s',target:200},{duration:'10s',target:500},{duration:'10s',target:1000},{duration:'15s',target:2000},{duration:'30s',target:2000},{duration:'10s',target:0}],gracefulRampDown:'15s'}},thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<2000','p(99)<5000'],http_reqs:['count>=4000'],business_errors:['rate<0.01'],answer_latency:['p(95)<2500'],checks:['rate>0.99']}}:{summaryTrendStats:['avg','min','med','max','p(95)','p(99)'],stages:traffic[scenario]||traffic.baseline,thresholds:standardThresholds};
function forwardedAddress(){const value=__VU-1;return `10.${Math.floor(value/65025)%250+1}.${Math.floor(value/255)%255}.${value%255+1}`;}
export default function(){
  const headers={Authorization:'Bearer '+session.botToken,'Content-Type':'application/json','X-Forwarded-For':forwardedAddress()};
  const status=http.get(`${session.baseUrl}/api/v1/status`,{headers,tags:{operation:'status'}}),statusOk=check(status,{'status 200':response=>response.status===200,'service identity':response=>response.status===200&&response.json('service')==='校园教务小助手'});errors.add(!statusOk);
  const answer=http.post(`${session.baseUrl}/api/v1/internal/qq/answer`,JSON.stringify({question:'如何申请缓考？',requestId:`load-${scenario}-${__VU}-${__ITER}-${Date.now()}`}),{headers,tags:{operation:'answer'}}),answerOk=check(answer,{'answer 200':response=>response.status===200,'answer from FAQ':response=>response.status===200&&response.json('faqId')==='exam-deferral'});answerLatency.add(answer.timings.duration);errors.add(!answerOk);sleep(scenario==='students2000'?5:.2);
}
