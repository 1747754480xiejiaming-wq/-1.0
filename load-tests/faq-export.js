import http from 'k6/http';
import { check,sleep } from 'k6';
import { Rate,Trend } from 'k6/metrics';

const session=JSON.parse(open('../qa/load-session.json')),errors=new Rate('export_errors'),exportLatency=new Trend('export_latency',true);
export const options={
  summaryTrendStats:['avg','min','med','max','p(95)','p(99)'],
  stages:[{duration:'5s',target:5},{duration:'20s',target:5},{duration:'5s',target:0}],
  thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<5000','p(99)<8000'],http_reqs:['count>=20'],export_errors:['rate<0.01'],export_latency:['p(95)<5000'],checks:['rate>0.99']},
};

export default function(){
  const response=http.get(`${session.baseUrl}/api/v1/faqs/export.xlsx?libraryType=answer`,{headers:{Cookie:session.cookie},tags:{operation:'question-only-excel-export'},timeout:'15s'});
  const ok=check(response,{
    'export status 200':value=>value.status===200,
    'xlsx content type':value=>String(value.headers['Content-Type']||'').includes('spreadsheetml.sheet'),
    'xlsx zip signature':value=>value.body?.charCodeAt(0)===80&&value.body?.charCodeAt(1)===75,
    'question rows seeded':()=>session.exportRows>=5000,
  });
  exportLatency.add(response.timings.duration);errors.add(!ok);sleep(1);
}
