import { useEffect,useState,type ReactNode } from 'react';
import { Button,MessageBar,MessageBarBody,Spinner,Badge } from '@fluentui/react-components';
import { ArrowClockwise,ArrowLeft,ArrowRight,BookOpen } from '@phosphor-icons/react';
import { api,messageOf } from './api';
export function useData<T>(path:string,revision=0) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let live=true;setLoading(true);setError('');api<T>(path).then(x=>{if(live)setData(x);}).catch(e=>{if(live)setError(messageOf(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[path,revision]);
  return {data,error,loading,setData};
}
export const dateTime=(value:number)=>new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(value);
export function Notice({children,intent='error'}:{children:ReactNode;intent?:'error'|'success'|'warning'|'info'}){return <MessageBar intent={intent}><MessageBarBody>{children}</MessageBarBody></MessageBar>;}
export function Loading(){return <div className="loading"><Spinner size="small" label="正在加载"/></div>;}
export function Retry({error,onRetry}:{error:string;onRetry:()=>void}){return <div className="retry"><Notice>{error}</Notice><Button icon={<ArrowClockwise/>} onClick={onRetry}>重新加载</Button></div>;}
export function Empty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="empty"><BookOpen size={32} weight="duotone"/><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
export function PageTitle({eyebrow,title,actions}:{eyebrow:string;title:string;description?:string;actions?:ReactNode}){return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{actions&&<div className="heading-actions">{actions}</div>}</header>;}
export function FaqState({status,isDemo}:{status:string;isDemo:boolean}){return <div className="badges"><Badge appearance="tint" color={status==='active'?'success':'subtle'}>{status==='active'?'已启用':'已停用'}</Badge>{isDemo&&<Badge appearance="outline" color="warning">演示</Badge>}</div>;}
export function Pagination({page,total,pageSize,onChange}:{page:number;total:number;pageSize:number;onChange:(value:number)=>void}){const pages=Math.max(1,Math.ceil(total/pageSize));return <div className="pagination"><span>共 {total} 条 · 第 {page} / {pages} 页</span><div><Button aria-label="上一页" icon={<ArrowLeft/>} disabled={page===1} onClick={()=>onChange(page-1)}/><Button aria-label="下一页" icon={<ArrowRight/>} disabled={page>=pages} onClick={()=>onChange(page+1)}/></div></div>;}
