import type { FallbackReason, Faq } from '@campus/contracts';
import { normalize } from '../db/store.js';
export function questionPolicy(question: string): FallbackReason | null {
  if(/\d{5,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:我叫|姓名[：:\s]|身份证|学号[：:\s]|QQ号|手机号|手机号码|住址|家庭地址)/i.test(question)) return 'sensitive_input';
  if(/(?:我的|本人|帮我查|查询我).{0,8}(?:分数|成绩|排名|身份证|学籍信息)|(?:成绩|分数).{0,4}(?:是|为)\s*\d/.test(question)) return 'sensitive_input';
  if(/忽略.{0,12}(?:指令|规则|限制)|泄露|系统提示词|system\s*prompt|api.?key|扮演|执行代码|<script/i.test(question)) return 'unsafe_instruction';
  if(/天气|股票|炒股|彩票|比特币|写情书|写(?:一首)?诗|诗歌创作|讲故事|讲笑话|做饭|菜谱|打游戏|世界杯|最高的山|最高山|推荐电影/.test(question)) return 'out_of_scope';
  return null;
}
export const isAcademic = (question: string) => /教务|教学|评教|教学评价|评价系统|教评|学校|学院|学期|学籍|学分|选课|课程|课表|老师|学生|考试|成绩|分数|毕业|材料|学位|论文|实习|实验|实验服|宿舍|奖学金|助学金|重修|补考|缓考|证明|注册|学费|休学|复学|教室|图书|培养|退课|退选|签到|报到|团员|团组织|组织关系|智慧团建/.test(question);
export function keywordMatch(question: string, faqs: Faq[]): {faq?:Faq;ambiguous:boolean} {
  const q=normalize(question),exact=faqs.find(f=>normalize(f.question)===q);
  if(exact) return {faq:exact,ambiguous:false};
  if(/不是|并非|不要|不想|不需要|不是要|而是/.test(question))return {ambiguous:true};
  const scored=faqs.map(f=>({f,score:f.keywords.reduce((n,k)=>{const key=normalize(k);return key.length>=3 && q.includes(key)?n+key.length:n;},0)})).filter(x=>x.score>=4).sort((a,b)=>b.score-a.score);
  if(scored.length>1) return {ambiguous:true};
  return {faq:scored[0]?.f,ambiguous:false};
}
export function sensitiveMatch(question: string, faqs: Faq[]): Faq | undefined {
  const q=normalize(question),exact=faqs.find(f=>normalize(f.question)===q);
  if(exact)return exact;
  return faqs.map(f=>({f,score:f.keywords.reduce((score,keyword)=>{const key=normalize(keyword);return key&&q.includes(key)?Math.max(score,key.length):score;},0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score)[0]?.f;
}
export const needsSensitiveSemanticReview=(question:string)=>/(?:你|他|她|老师|同学|这个人|这种人).{0,12}(?:不配|恶心|没素质|没教养|丢人|可耻|滚|蠢|笨|垃圾|废物|有病)/.test(normalize(question));
function grams(s: string) { const text=normalize(s); return new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2))); }
export function candidatesFor(question: string,faqs: Faq[]) {
  let selected=faqs;
  if(faqs.length>50) {
    const q=grams(question);
    selected=faqs.map(f=>{const terms=grams(f.question+f.keywords.join(''));return {f,score:[...q].filter(t=>terms.has(t)).length};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,20).map(x=>x.f);
  }
  let chars=0;
  return selected.filter(f=>{chars+=JSON.stringify({id:f.id,question:f.question,keywords:f.keywords}).length;return chars<=10000;});
}
