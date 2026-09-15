import { ModelsPanel } from './Models';
import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { Button,Badge,Field,Input,Spinner } from '@fluentui/react-components';
import { ArrowRight,ArrowClockwise,BookOpen,Question,ChatCircle,CheckCircle,FloppyDisk,Key,Play,Pause } from '@phosphor-icons/react';
import type { AdminStatus,BotActionResult,BotConfig,DeveloperAccess,Unmatched,PageResult } from '@campus/contracts';
import { api,messageOf } from '../api';
import { useData,PageTitle,Loading,Retry,Notice,Empty,dateTime } from '../ui';
export function Dashboard(){const [revision,setRevision]=useState(0),{data,error,loading}=useData<AdminStatus>('/admin/status',revision),{data:pending}=useData<PageResult<Unmatched>>('/unmatched?status=pending&pageSize=4',revision);
  return <div className="admin-page dashboard-page"><PageTitle eyebrow="WORKSPACE OVERVIEW" title="工作概览" actions={<Button icon={<ArrowClockwise/>} onClick={()=>setRevision(x=>x+1)}>刷新</Button>}/>{error?<Retry error={error} onRetry={()=>setRevision(x=>x+1)}/>:loading&&!data?<Loading/>:data&&<>
    <div className="metrics"><Metric label="今日咨询" value={data.todayRequests} detail={`累计 ${data.totalRequests} 次有效请求`} icon={<ChatCircle/>}/><Metric label="公开知识" value={data.activeFaqs} detail={`知识库共 ${data.totalFaqs} 条`} icon={<BookOpen/>}/><Metric label="待解答问题" value={data.pendingQuestions} detail="等待老师补充或归类" icon={<Question/>}/><Metric label="知识库命中率" value={data.hitRate===null?'—':`${Math.round(data.hitRate*100)}%`} detail="累计知识命中 / 全部请求" icon={<CheckCircle/>}/></div>
    <div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-title"><div><h2>近 7 天咨询</h2></div><Badge appearance="outline">按北京时间</Badge></div><div className="bar-chart" role="img" aria-label={data.recentDays.map(d=>`${d.day} ${d.hits}次`).join('，')}>{data.recentDays.map(d=><div className="chart-column" key={d.day}><span>{d.hits}</span><div className="bar-track"><div className="bar" style={{height:d.hits?`${Math.max(3,d.hits/Math.max(1,...data.recentDays.map(x=>x.hits))*100)}%`:'0%'}}/></div><small>{d.day.slice(5).replace('-','/')}</small></div>)}</div>{!data.totalRequests&&<p className="chart-caption">收到第一条咨询后，这里会开始记录真实数据。</p>}</section>
    <section className="panel pending-panel"><div className="panel-title"><div><h2>待解答问题</h2></div><Link className="text-link" to="/admin/unmatched">查看全部 <ArrowRight/></Link></div>{pending?.items.length?<div className="pending-list">{pending.items.map(item=><Link to="/admin/unmatched" key={item.id}><Question size={19}/><span>{item.question}</span><small>{item.webCount+item.qqCount} 次咨询</small><ArrowRight size={17}/></Link>)}</div>:<Empty title="暂时没有待处理问题"/>}</section></div>
  </>}</div>;
}
function Metric({label,value,detail,icon}:{label:string;value:string|number;detail:string;icon:React.ReactNode}){return <div className="metric"><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail}</small></div>;}
function StatusRow({label,text,ok}:{label:string;text:string;ok:boolean}){return <div className="status-row"><span>{label}</span><span><span className={`tiny-dot ${ok?'':'gray'}`}/>{text}</span></div>;}
export function Settings(){return <DeveloperManagement/>;}
export function DeveloperManagement({embedded=false}:{embedded?:boolean}){
  const [revision,setRevision]=useState(0),{data,error,loading}=useData<DeveloperAccess>('/admin/developer/access',revision);
  const className=embedded?'developer-management-embedded':'admin-page';
  if(loading&&!data)return <div className={className}>{!embedded&&<PageTitle eyebrow="DEVELOPER MANAGEMENT" title="开发管理系统"/>}<Loading/></div>;
  if(error)return <div className={className}>{!embedded&&<PageTitle eyebrow="DEVELOPER MANAGEMENT" title="开发管理系统"/>}<Retry error={error} onRetry={()=>setRevision(x=>x+1)}/></div>;
  if(!data?.unlocked)return <DeveloperGate embedded={embedded} onUnlocked={()=>setRevision(x=>x+1)}/>;
  return <RunningStatus embedded={embedded}/>;
}
function DeveloperGate({onUnlocked,embedded=false}:{onUnlocked:()=>void;embedded?:boolean}){
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function unlock(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await api('/admin/developer/unlock',{method:'POST',body:{key}});setKey('');onUnlocked();}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
  return <div className={embedded?'developer-management-embedded':'admin-page'}>{!embedded&&<PageTitle eyebrow="DEVELOPER MANAGEMENT" title="开发管理系统"/>}<section className="panel developer-gate"><Key size={30}/><h2>开发者验证</h2><form onSubmit={unlock}><Field label="开发者密匙" required validationMessage={error}><Input type="password" autoComplete="off" value={key} onChange={(_,data)=>setKey(data.value)}/></Field><Button type="submit" appearance="primary" disabled={busy||!key} icon={busy?<Spinner size="tiny"/>:<Key/>}>{busy?'正在验证':'验证并查看'}</Button></form></section></div>;
}
function RunningStatus({embedded=false}:{embedded?:boolean}){
  const [revision,setRevision]=useState(0),{data,error}=useData<AdminStatus>('/admin/status',revision);
  useEffect(()=>{const timer=setInterval(()=>setRevision(x=>x+1),5000);return()=>clearInterval(timer);},[]);
  return <div className={embedded?'developer-management-embedded':'admin-page'}>{!embedded&&<PageTitle eyebrow="DEVELOPER MANAGEMENT" title="开发管理系统" actions={<Button icon={<ArrowClockwise/>} onClick={()=>setRevision(x=>x+1)}>刷新状态</Button>}/>}<ModelsPanel/>
    <div className="settings-grid">{error?<Retry error={error} onRetry={()=>setRevision(x=>x+1)}/>:!data?<Loading/>:<BotSettings status={data} onChange={()=>setRevision(x=>x+1)}/>}</div>
  </div>;
}

function BotSettings({status,onChange}:{status:AdminStatus;onChange:()=>void}){
  const [revision,setRevision]=useState(0),{data,error,loading}=useData<BotConfig>('/admin/bot/config',revision),[appId,setAppId]=useState(''),[appSecret,setAppSecret]=useState(''),[action,setAction]=useState<'save'|'start'|'stop'|''>(''),[notice,setNotice]=useState<{ok:boolean;message:string}|null>(null);
  useEffect(()=>{if(data)setAppId(data.appId);},[data]);
  async function save(event:React.FormEvent){event.preventDefault();setAction('save');setNotice(null);try{await api<BotConfig>('/admin/bot/config',{method:'POST',body:{appId,appSecret}});setAppSecret('');setNotice({ok:true,message:'凭证已保存，QQ 消息接收进程将自动连接。'});setRevision(x=>x+1);onChange();}catch(e){setNotice({ok:false,message:messageOf(e)});}finally{setAction('');}}
  async function control(kind:'start'|'stop'){setAction(kind);setNotice(null);try{const result=await api<BotActionResult>(`/admin/bot/${kind}`,{method:'POST'});setNotice({ok:true,message:result.message});setRevision(x=>x+1);onChange();}catch(e){setNotice({ok:false,message:messageOf(e)});}finally{setAction('');}}
  const configured=data?.appSecretConfigured??status.botCredentialsConfigured,running=status.botProcessRunning,answering=status.qqAnswerEnabled,changedId=!!data&&appId!==data.appId,dirty=changedId||!!appSecret.trim();
  return <section className="panel bot-settings-panel"><div className="panel-title"><div><h2>QQ 机器人</h2></div><ChatCircle size={24} weight="duotone"/></div>
    <StatusRow label="消息接收" text={status.botState==='connected'?'已连接 QQ':'正在重连'} ok={status.botState==='connected'}/><StatusRow label="回答状态" text={answering?'正常回答':'已暂停，消息继续排队'} ok={answering}/><StatusRow label="接收进程" text={running?'正在运行':'未启动'} ok={running}/><StatusRow label="平台凭证" text={configured?'已保存':'未配置'} ok={configured}/>
    {loading&&!data?<div className="bot-config-loading"><Spinner size="tiny" label="正在读取机器人配置"/></div>:error?<Notice>{error}</Notice>:<form className="bot-credential-form" onSubmit={save}>
      <Field label="AppID" required hint="QQ 开放平台应用的数字 ID"><Input inputMode="numeric" autoComplete="off" value={appId} onChange={(_,value)=>setAppId(value.value.replace(/\D/g,'').slice(0,20))} placeholder="请输入 AppID" required/></Field>
      <Field label="AppSecret" required={!configured||changedId} hint={changedId?'更换机器人时必须填写配套的新 AppSecret':configured?'当前机器人已保存；留空保留原密钥':'仅保存在本机，不会回显'}><Input type="password" autoComplete="new-password" value={appSecret} onChange={(_,value)=>setAppSecret(value.value)} placeholder={configured?'已配置，留空表示不修改':'请输入 AppSecret'} required={!configured||changedId}/></Field>
      <div className="bot-actions"><Button type="submit" icon={action==='save'?<Spinner size="tiny"/>:<FloppyDisk/>} disabled={!!action||!/^\d{5,20}$/.test(appId)||((!configured||changedId)&&appSecret.length<8)}>保存凭证</Button><Button type="button" appearance={answering?'secondary':'primary'} aria-label={answering?'暂停回答':'恢复回答'} aria-pressed={answering} icon={action==='start'||action==='stop'?<Spinner size="tiny"/>:answering?<Pause/>:<Play/>} disabled={!!action||(!answering&&(!configured||dirty))} onClick={()=>void control(answering?'stop':'start')}>{action==='start'?'正在恢复':action==='stop'?'正在暂停':answering?'暂停回答':'恢复回答'}</Button></div>
    </form>}
    <p className="muted settings-description">最后心跳：{status.botLastSeen?dateTime(status.botLastSeen):'尚未收到'}</p>{notice&&<Notice intent={notice.ok?'success':'error'}>{notice.message}</Notice>}
  </section>;
}
