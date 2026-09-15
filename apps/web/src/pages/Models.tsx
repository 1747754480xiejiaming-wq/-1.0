import { useEffect,useState } from 'react';
import { Badge,Button,Field,Input,Spinner } from '@fluentui/react-components';
import { Brain,Circuitry,PlugsConnected,Power,CheckCircle } from '@phosphor-icons/react';
import type { ModelConnection,ModelsStatus } from '@campus/contracts';
import { api,messageOf } from '../api';
import { Loading,Notice,Retry,dateTime,useData } from '../ui';

export function ModelsPanel(){
  const [revision,setRevision]=useState(0),{data,error}=useData<ModelsStatus>('/admin/models',revision);
  const refresh=()=>setRevision(x=>x+1);useEffect(()=>{const timer=setInterval(refresh,3000);return()=>clearInterval(timer);},[]);
  if(!data)return error?<Retry error={error} onRetry={refresh}/>:<Loading/>;
  const usage=data.usage,textModels=data.providers.filter(item=>item.provider==='deepseek'||item.provider==='zhipu');
  return <div className="models-section">{error&&<Notice intent="warning">用量更新失败，当前显示最近一次数据。{error}</Notice>}
    <div className="model-cards">{textModels.map(item=><ModelCard key={item.provider} item={item} selected={data.activeTextProvider===item.provider} onChange={refresh}/>)}</div>
    <section className="panel weekly-usage" aria-label="本周模型用量"><div className="panel-title"><div><h2>本周模型用量</h2></div><Badge appearance="tint" color={usage.exhausted?'danger':'success'}>{usage.exhausted?'已超额':'额度可用'}</Badge></div>
      <div className="budget-summary"><div><span>额度消耗</span><strong>{usage.consumedPercent.toFixed(2)}<small>%</small></strong></div><div><span>本周 Token</span><strong>{usage.totalTokens.toLocaleString()}</strong></div></div>
      <div className="usage-track" role="progressbar" aria-label="额度消耗百分比" aria-valuenow={usage.consumedPercent} aria-valuemin={0} aria-valuemax={100}><div style={{width:`${usage.consumedPercent}%`}}/></div>
      <div className="model-token-table">{usage.providers.filter(item=>item.provider!=='qwen'||item.totalTokens>0).map(item=><div key={item.provider}><strong>{item.provider==='deepseek'?'千源 D1':item.provider==='zhipu'?'千源 Z1':'视觉识别'}</strong><span>输入 <b>{item.inputTokens.toLocaleString()}</b></span><span>输出 <b>{item.outputTokens.toLocaleString()}</b></span><span>合计 <b>{item.totalTokens.toLocaleString()}</b> Token</span></div>)}</div>
      <div className="usage-footnote"><span>{usage.activeCalls?`${usage.activeCalls} 次调用处理中，额度已预留`:'每 3 秒更新；Token 在模型返回后记入'}</span><span>下次重置 {dateTime(usage.resetAt)}</span></div>
      {usage.exhausted&&<Notice intent="error">本周模型额度已超额，已停止新的模型调用。请等待下周重置；知识库直接匹配仍可使用。</Notice>}
      {usage.unknownCalls>0&&<Notice intent="warning">有 {usage.unknownCalls} 次调用未返回完整用量，暂保留预占额度，避免重复消耗。已返回 Token 单独统计。</Notice>}
    </section>
  </div>;
}
function ModelCard({item,selected,onChange}:{item:ModelConnection;selected:boolean;onChange:()=>void}){
  const [busy,setBusy]=useState(false),[apiKey,setApiKey]=useState(''),[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
  const providerName=item.provider==='deepseek'?'DeepSeek':'智谱',requiresKey=!item.keyConfigured;
  async function connect(){setBusy(true);setNotice(null);try{const result=await api<{message:string}>(`/admin/models/${item.provider}/connect`,{method:'POST',body:{...(requiresKey?{apiKey:apiKey.trim()}:{})}});setNotice({ok:true,text:result.message});}catch(e){setNotice({ok:false,text:messageOf(e)});}finally{setApiKey('');setBusy(false);onChange();}}
  async function disconnect(){setBusy(true);try{await api(`/admin/models/${item.provider}/disconnect`,{method:'POST'});setNotice(null);}catch(e){setNotice({ok:false,text:messageOf(e)});}finally{setBusy(false);onChange();}}
  return <section className={`panel model-card ${selected&&item.connected?'selected':''}`} aria-label={`${item.name}模型`}><div className="panel-title"><div className="model-card-title"><span className="icon-tile">{item.provider==='zhipu'?<Brain size={25}/>:<Circuitry size={25}/>}</span><div><h2>{item.name}</h2></div></div><Badge appearance="tint" color={item.connected?'success':'subtle'}>{item.connected?'已连接':'未连接'}</Badge></div>
    {requiresKey&&<Field className="model-key-field" label={`${providerName} API Key`} hint="仅保存到本机后端，连接后不会回显" required><Input type="password" autoComplete="new-password" value={apiKey} maxLength={512} onChange={(_,data)=>setApiKey(data.value)} placeholder={`请输入 ${providerName} API Key`}/></Field>}
    <div className="model-actions"><Button appearance="primary" icon={busy?<Spinner size="tiny"/>:<PlugsConnected/>} disabled={busy||item.connected||(requiresKey&&apiKey.trim().length<8)} onClick={()=>void connect()}>{busy?'连接处理中':'连接'}</Button>{item.connected&&<><Button icon={selected?<CheckCircle/>:undefined} disabled>{selected?'设置中已选择':'设置中未选择'}</Button><Button appearance="subtle" icon={<Power/>} disabled={busy} onClick={()=>void disconnect()}>断开</Button></>}</div>
    <p className="model-check-note">{item.checkedAt?`最近验证 ${dateTime(item.checkedAt)}`:'连接会进行一次小型验证，并计入共享周额度。'}</p>
    {notice&&<Notice intent={notice.ok?'success':'error'}>{notice.text}</Notice>}
  </section>;
}
